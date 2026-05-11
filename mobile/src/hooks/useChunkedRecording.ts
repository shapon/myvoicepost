/**
 * useChunkedRecording Hook
 *
 * Manages background audio processing for recordings exceeding 1 minute.
 * Automatically processes audio in 60-second chunks while recording continues.
 *
 * Features:
 * - Automatic chunk detection at 60-second intervals
 * - Background transcription processing
 * - Accumulated text management
 * - Polish/Translate API integration
 * - Offline queue support
 * - Retry logic for failed chunks
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { transcribeApi, polishApi, translateApi } from '../lib/api';
import { pendingProcessor } from '../utils/pendingProcessor';
import { ErrorReporter } from '../utils/errorHandler';
import { backgroundRecordingManager } from '../utils/backgroundRecordingManager';
import { recordingPersistenceManager } from '../utils/recordingPersistenceManager';
import { secureLog } from '../utils/secureLogger';

// Constants
const CHUNK_DURATION_SEC = 60; // 60 seconds per chunk
const PERSISTENCE_SEGMENT_SEC = 5; // 5 seconds per persistence segment
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 2000;

// Types
export interface ChunkInfo {
  id: string;
  index: number;
  startTime: number;
  endTime: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  transcribedText?: string;
  error?: string;
  retryCount: number;
  base64Audio?: string;
}

export interface ChunkedRecordingState {
  isRecording: boolean;
  currentDuration: number;
  chunks: ChunkInfo[];
  accumulatedOriginalText: string;
  processedResult: string; // For polish: polishedText, For translate: polishedText
  translatedText?: string; // For translate only: raw translated text
  isProcessingChunk: boolean;
  currentChunkIndex: number;
  processingProgress: number; // 0-100 percentage
}

export interface ChunkedRecordingOptions {
  type: 'polish' | 'translate';
  language?: string;
  sourceLanguage?: string;
  targetLanguage?: string;
  outputFormat?: string; // tone
  outputType?: string;
  onChunkProcessed?: (chunk: ChunkInfo, accumulatedText: string) => void;
  onResultUpdated?: (originalText: string, resultText: string, translatedText?: string) => void;
  onError?: (error: Error, chunk?: ChunkInfo) => void;
  enableBackgroundProcessing?: boolean;
}

export interface UseChunkedRecordingResult {
  // State
  state: ChunkedRecordingState;

  // Actions
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<{ originalText: string; resultText: string; translatedText?: string } | null>;
  pauseRecording: () => Promise<void>;
  resumeRecording: () => Promise<void>;
  cancelRecording: () => Promise<void>;

  // Crash-resilient actions
  emergencyStopAndFinalize: () => Promise<void>;

  // Manual controls
  processCurrentChunk: () => Promise<void>;
  retryFailedChunks: () => Promise<void>;

  // State management
  appendToAccumulatedText: (text: string) => void;
  clearState: () => void;

  // Status
  permissionGranted: boolean;
  isOnline: boolean;
}

export function useChunkedRecording(
  options: ChunkedRecordingOptions
): UseChunkedRecordingResult {
  // State
  const [state, setState] = useState<ChunkedRecordingState>({
    isRecording: false,
    currentDuration: 0,
    chunks: [],
    accumulatedOriginalText: '',
    processedResult: '',
    isProcessingChunk: false,
    currentChunkIndex: 0,
    processingProgress: 0,
  });

  const [permissionGranted, setPermissionGranted] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  // Refs
  const recordingRef = useRef<Audio.Recording | null>(null);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const totalDurationRef = useRef(0);
  const sessionIdRef = useRef<string>('');
  const chunkStartTimeRef = useRef<number>(0);
  const lastProcessedDurationRef = useRef<number>(0);
  const isProcessingRef = useRef<boolean>(false);
  const pendingChunksQueueRef = useRef<ChunkInfo[]>([]);

  // Refs that mirror state to avoid stale-closure reads in stopRecording
  const accumulatedTextRef = useRef<string>('');
  const processedResultRef = useRef<string>('');

  // Persistence segment refs
  const persistenceSegmentIndexRef = useRef<number>(0);
  const segmentStartTimeRef = useRef<number>(0);
  const isRotatingSegmentRef = useRef<boolean>(false);
  const persistenceSessionDirRef = useRef<string>('');

  // Options ref to avoid stale closures
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Initialize
  useEffect(() => {
    requestPermissions();
    checkNetworkStatus();

    return () => {
      cleanup();
    };
  }, []);

  // Network status check
  const checkNetworkStatus = async () => {
    const online = await pendingProcessor.isOnline();
    setIsOnline(online);
  };

  // Request audio permissions
  const requestPermissions = async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      setPermissionGranted(status === 'granted');
    } catch (error) {
      ErrorReporter.report(error as Error, 'useChunkedRecording.requestPermissions');
    }
  };

  // Cleanup function
  const cleanup = useCallback(async () => {
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
    // chunkIntervalRef no longer used - merged with durationIntervalRef
    if (recordingRef.current) {
      try {
        const status = await recordingRef.current.getStatusAsync();
        if (status.isRecording) {
          await recordingRef.current.stopAndUnloadAsync();
        }
      } catch (e) {
        // Ignore cleanup errors
      }
      recordingRef.current = null;
    }
  }, []);

  // Generate unique session ID
  const generateSessionId = () => {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  };

  // Generate chunk ID
  const generateChunkId = (sessionId: string, index: number) => {
    return `${sessionId}_chunk_${index}`;
  };

  /**
   * Rotate persistence segment: stop current recording, save segment to disk, start new recording.
   * Called every PERSISTENCE_SEGMENT_SEC seconds to ensure crash resilience.
   */
  const rotatePersistenceSegment = useCallback(async () => {
    if (!recordingRef.current || isRotatingSegmentRef.current || isProcessingRef.current) {
      return;
    }

    isRotatingSegmentRef.current = true;

    try {
      const currentRecording = recordingRef.current;
      const segmentIndex = persistenceSegmentIndexRef.current;
      const segmentStartMs = segmentStartTimeRef.current;
      const segmentDurationMs = Date.now() - segmentStartMs;

      await currentRecording.stopAndUnloadAsync();
      const uri = currentRecording.getURI();

      if (uri) {
        await recordingPersistenceManager.registerSegment(
          uri,
          segmentIndex,
          segmentStartMs,
          segmentDurationMs
        );
      }

      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      recordingRef.current = newRecording;
      persistenceSegmentIndexRef.current = segmentIndex + 1;
      segmentStartTimeRef.current = Date.now();

      secureLog.debug(
        `[ChunkedRecording] Persistence segment ${segmentIndex} saved (${segmentDurationMs}ms)`
      );
    } catch (error) {
      secureLog.error('[ChunkedRecording] Persistence segment rotation failed:', error);
      ErrorReporter.report(error as Error, 'useChunkedRecording.rotatePersistenceSegment');
    } finally {
      isRotatingSegmentRef.current = false;
    }
  }, []);

  /**
   * Emergency stop and finalize: immediately saves current segment and finalizes the session.
   * Called when battery is critically low or other emergency conditions.
   */
  const emergencyStopAndFinalize = useCallback(async (): Promise<void> => {
    secureLog.warn('[ChunkedRecording] Emergency stop and finalize triggered');

    try {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }

      if (recordingRef.current) {
        const segmentIndex = persistenceSegmentIndexRef.current;
        const segmentDurationMs = Date.now() - segmentStartTimeRef.current;

        try {
          await recordingRef.current.stopAndUnloadAsync();
          const uri = recordingRef.current.getURI();

          if (uri && recordingPersistenceManager.isSessionActive()) {
            await recordingPersistenceManager.registerSegment(
              uri,
              segmentIndex,
              segmentStartTimeRef.current,
              segmentDurationMs
            );
          }
        } catch (e) {
          secureLog.error('[ChunkedRecording] Emergency stop recording error:', e);
        }

        recordingRef.current = null;
      }

      await recordingPersistenceManager.emergencyFinalize();

      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });

      setState(prev => ({
        ...prev,
        isRecording: false,
        isProcessingChunk: false,
      }));

      secureLog.warn('[ChunkedRecording] Emergency finalize complete');
    } catch (error) {
      secureLog.error('[ChunkedRecording] Emergency finalize failed:', error);
    }
  }, []);

  /**
   * Extract and process the current chunk of audio
   */
  const extractAndProcessChunk = useCallback(async (chunkIndex: number) => {
    if (!recordingRef.current || isProcessingRef.current) {
      console.log('[ChunkedRecording] Skip chunk extraction - no recording or already processing');
      return;
    }

    const sessionId = sessionIdRef.current;
    const chunkId = generateChunkId(sessionId, chunkIndex);

    console.log('='.repeat(60));
    console.log(`[ChunkedRecording] ???? EXTRACTING CHUNK ${chunkIndex}`);
    console.log(`[ChunkedRecording] Chunk ID: ${chunkId}`);
    console.log(`[ChunkedRecording] Current duration: ${state.currentDuration}s`);
    console.log(`[ChunkedRecording] Time range: ${lastProcessedDurationRef.current}s - ${lastProcessedDurationRef.current + CHUNK_DURATION_SEC}s`);
    console.log('='.repeat(60));

    try {
      isProcessingRef.current = true;

      // Create chunk info
      const chunkInfo: ChunkInfo = {
        id: chunkId,
        index: chunkIndex,
        startTime: lastProcessedDurationRef.current,
        endTime: lastProcessedDurationRef.current + CHUNK_DURATION_SEC,
        status: 'pending',
        retryCount: 0,
      };

      // Add to state
      setState(prev => ({
        ...prev,
        chunks: [...prev.chunks, chunkInfo],
        isProcessingChunk: true,
        currentChunkIndex: chunkIndex,
      }));

      // Stop current recording to get the audio
      const currentRecording = recordingRef.current;
      await currentRecording.stopAndUnloadAsync();
      const uri = currentRecording.getURI();

      if (!uri) {
        throw new Error('Failed to get recording URI');
      }

      // Read the audio as base64
      const base64Audio = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Update chunk with audio
      chunkInfo.base64Audio = base64Audio;

      // Start a new recording immediately to continue capturing
      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      recordingRef.current = newRecording;
      chunkStartTimeRef.current = Date.now();
      lastProcessedDurationRef.current = totalDurationRef.current;
      console.log(`[DEBUG ChunkedRecording] Updated lastProcessedDuration to ${totalDurationRef.current}s`);

      // Process the chunk in background
      processChunkInBackground(chunkInfo);

    } catch (error) {
      console.error('[ChunkedRecording] Chunk extraction failed:', error);
      ErrorReporter.report(error as Error, 'useChunkedRecording.extractAndProcessChunk');

      // Update chunk status to failed
      setState(prev => ({
        ...prev,
        chunks: prev.chunks.map(c =>
          c.id === chunkId ? { ...c, status: 'failed', error: (error as Error).message } : c
        ),
        isProcessingChunk: false,
      }));

      optionsRef.current.onError?.(error as Error);
    } finally {
      isProcessingRef.current = false;
    }
  }, []);

  /**
   * Process a chunk in the background
   */
  const processChunkInBackground = async (chunk: ChunkInfo) => {
    const opts = optionsRef.current;

    try {
      // Update status to processing
      setState(prev => ({
        ...prev,
        chunks: prev.chunks.map(c =>
          c.id === chunk.id ? { ...c, status: 'processing' } : c
        ),
      }));

      // Check if online
      const online = await pendingProcessor.isOnline();
      setIsOnline(online);

      if (!online) {
        console.log('[ChunkedRecording] Offline - queueing chunk for later');
        // Queue for offline processing
        pendingChunksQueueRef.current.push(chunk);

        setState(prev => ({
          ...prev,
          chunks: prev.chunks.map(c =>
            c.id === chunk.id ? { ...c, status: 'pending', error: 'Offline - queued for later' } : c
          ),
          isProcessingChunk: false,
        }));
        return;
      }

      // Transcribe the chunk
      const language = opts.type === 'translate' ? opts.sourceLanguage : opts.language;
      const chunkDurationSec = CHUNK_DURATION_SEC;
      console.log(`[DEBUG ChunkedRecording] CHUNK ${chunk.index}: sending durationSeconds=${chunkDurationSec} (full chunk)`);
      const transcribeResult = await transcribeApi.transcribe(
        chunk.base64Audio!,
        language || 'en',
        'audio/mp4',
        chunkDurationSec
      );

      const transcribedText = transcribeResult.originalText;
      chunk.transcribedText = transcribedText;

      console.log('='.repeat(60));
      console.log(`[ChunkedRecording] ✅ CHUNK ${chunk.index} TRANSCRIBED`);
      console.log(`[ChunkedRecording] Transcribed text: "${transcribedText}"`);
      console.log(`[ChunkedRecording] Text length: ${transcribedText.length} characters`);
      console.log('='.repeat(60));

      // Append to accumulated text
      setState(prev => {
        const newAccumulatedText = prev.accumulatedOriginalText
          ? prev.accumulatedOriginalText.trim() + ' ' + transcribedText.trim()
          : transcribedText.trim();

        accumulatedTextRef.current = newAccumulatedText; // keep ref in sync
        console.log(`[ChunkedRecording] New accumulated text length: ${newAccumulatedText.length}`);
        console.log(`[ChunkedRecording] Triggering background ${optionsRef.current.type} processing...`);

        // Process accumulated text for polish/translate
        processAccumulatedText(newAccumulatedText);

        return {
          ...prev,
          chunks: prev.chunks.map(c =>
            c.id === chunk.id ? { ...c, status: 'completed', transcribedText } : c
          ),
          accumulatedOriginalText: newAccumulatedText,
          isProcessingChunk: false,
          processingProgress: ((chunk.index + 1) / prev.chunks.length) * 100,
        };
      });

      opts.onChunkProcessed?.(chunk, transcribedText);

    } catch (error) {
      console.error(`[ChunkedRecording] Chunk ${chunk.index} processing failed:`, error);

      // Retry logic
      if (chunk.retryCount < MAX_RETRY_ATTEMPTS) {
        console.log(`[ChunkedRecording] Retrying chunk ${chunk.index} (attempt ${chunk.retryCount + 1})`);
        chunk.retryCount++;

        await delay(RETRY_DELAY_MS);
        return processChunkInBackground(chunk);
      }

      setState(prev => ({
        ...prev,
        chunks: prev.chunks.map(c =>
          c.id === chunk.id ? { ...c, status: 'failed', error: (error as Error).message } : c
        ),
        isProcessingChunk: false,
      }));

      opts.onError?.(error as Error, chunk);
    }
  };

  /**
   * Process accumulated text through polish/translate API
   */
  const processAccumulatedText = async (accumulatedText: string) => {
    const opts = optionsRef.current;

    if (!opts.enableBackgroundProcessing) {
      console.log('[ChunkedRecording] Background processing disabled');
      return;
    }

    console.log('='.repeat(60));
    console.log('[ChunkedRecording] ???? BACKGROUND PROCESSING STARTED');
    console.log('[ChunkedRecording] Type:', opts.type);
    console.log('[ChunkedRecording] Accumulated text length:', accumulatedText.length);
    console.log('[ChunkedRecording] Accumulated text preview:', accumulatedText.substring(0, 100));
    console.log('='.repeat(60));

    try {
      let resultText = '';

      if (opts.type === 'polish') {
        console.log('[ChunkedRecording] Calling polishApi.polishText...');
        const result = await polishApi.polishText(
          accumulatedText,
          opts.language || 'en',
          opts.outputFormat || 'professional',
          opts.outputType || 'general'
        );
        resultText = result.polishedText;
        console.log('[ChunkedRecording] ✅ Polish completed, result length:', resultText.length);
      } else {
        console.log('[ChunkedRecording] Calling translateApi.translateText...');
        const result = await translateApi.translateText(
          accumulatedText,
          opts.sourceLanguage || 'en',
          opts.targetLanguage || 'es',
          opts.outputFormat || 'professional'
        );
        // Use polishedText as the main result (this is the polished translation)
        resultText = result.polishedText;
        console.log('[ChunkedRecording] ✅ Translate completed, polished text length:', resultText.length);
        console.log('[ChunkedRecording] ✅ Raw translated text length:', result.translatedText.length);
      }

      processedResultRef.current = resultText; // keep ref in sync
      setState(prev => ({
        ...prev,
        processedResult: resultText,
      }));

      console.log('[ChunkedRecording] State updated with processed result');
      console.log('='.repeat(60));

      opts.onResultUpdated?.(accumulatedText, resultText);

    } catch (error) {
      console.error('[ChunkedRecording] ❌ Result processing failed:', error);
      console.log('='.repeat(60));
      // Don't fail the whole process, just log the error
    }
  };

  /**
   * Start recording with chunked processing and crash-resilient persistence segments
   */
  const startRecording = useCallback(async () => {
    if (!permissionGranted) {
      await requestPermissions();
      if (!permissionGranted) {
        throw new Error('Microphone permission not granted');
      }
    }

    try {
      const offlineRecordingEnabled = backgroundRecordingManager.isOfflineRecordingEnabled();
      await backgroundRecordingManager.configureAudioMode(offlineRecordingEnabled);

      secureLog.debug('[ChunkedRecording] Audio mode configured with background support:', offlineRecordingEnabled);

      sessionIdRef.current = generateSessionId();
      lastProcessedDurationRef.current = 0;

      const { sessionId: persistenceSessionId, sessionDir } =
        await recordingPersistenceManager.startSession('chunked', {
          recordingSessionId: sessionIdRef.current,
        });
      persistenceSessionDirRef.current = sessionDir;
      persistenceSegmentIndexRef.current = 0;
      segmentStartTimeRef.current = Date.now();

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      recordingRef.current = recording;
      chunkStartTimeRef.current = Date.now();

      accumulatedTextRef.current = '';
      processedResultRef.current = '';
      setState(prev => ({
        ...prev,
        isRecording: true,
        currentDuration: 0,
        chunks: [],
        accumulatedOriginalText: '',
        processedResult: '',
        isProcessingChunk: false,
        currentChunkIndex: 0,
        processingProgress: 0,
      }));

      let currentDuration = 0;
      totalDurationRef.current = 0;
      durationIntervalRef.current = setInterval(() => {
        currentDuration++;
        totalDurationRef.current = currentDuration;
        setState(prev => ({
          ...prev,
          currentDuration: currentDuration,
        }));

        if (currentDuration % CHUNK_DURATION_SEC === 0 && currentDuration > 0) {
          const chunkIndex = Math.floor(currentDuration / CHUNK_DURATION_SEC) - 1;
          secureLog.debug(`[ChunkedRecording] 60-second mark reached at ${currentDuration}s, extracting chunk ${chunkIndex}`);
          extractAndProcessChunk(chunkIndex);
        }
      }, 1000);

      secureLog.debug('[ChunkedRecording] Recording started with persistence session:', persistenceSessionId);

    } catch (error) {
      ErrorReporter.report(error as Error, 'useChunkedRecording.startRecording');
      throw error;
    }
  }, [permissionGranted, extractAndProcessChunk]);

  /**
   * Stop recording and process final chunk
   */
  const stopRecording = useCallback(async (): Promise<{ originalText: string; resultText: string } | null> => {
    if (!recordingRef.current) {
      return null;
    }

    try {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }

      const finalDuration = totalDurationRef.current;
      const remainingSeconds = finalDuration - lastProcessedDurationRef.current;
      secureLog.debug(`[ChunkedRecording] stopRecording: totalDuration=${finalDuration}, lastProcessed=${lastProcessedDurationRef.current}, finalChunkSeconds=${remainingSeconds}`);

      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();

      if (uri && recordingPersistenceManager.isSessionActive()) {
        const segmentDurationMs = Date.now() - segmentStartTimeRef.current;
        await recordingPersistenceManager.registerSegment(
          uri,
          persistenceSegmentIndexRef.current,
          segmentStartTimeRef.current,
          segmentDurationMs
        );
      }

      recordingRef.current = null;

      await recordingPersistenceManager.finalize();

      setState(prev => ({
        ...prev,
        isRecording: false,
      }));

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
      });

      if (!uri) {
        return null;
      }

      // Read final audio segment
      const base64Audio = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Calculate remaining duration after last processed chunk
      const remainingDuration = finalDuration - lastProcessedDurationRef.current;

      // Process final segment if there's significant audio (> 2 seconds)
      if (remainingDuration > 2 && base64Audio) {
        console.log(`[DEBUG ChunkedRecording] Processing final segment: remainingDuration=${remainingDuration}s`);

        const opts = optionsRef.current;
        const language = opts.type === 'translate' ? opts.sourceLanguage : opts.language;

        setState(prev => ({
          ...prev,
          isProcessingChunk: true,
        }));

        try {
          // Transcribe final segment with actual remaining duration
          console.log(`[DEBUG ChunkedRecording] FINAL CHUNK: sending durationSeconds=${remainingDuration} (last chunk)`);
          const transcribeResult = await transcribeApi.transcribe(
            base64Audio,
            language || 'en',
            'audio/mp4',
            remainingDuration
          );

          const finalTranscribedText = transcribeResult.originalText;

          // Combine with accumulated text — use ref to avoid stale closure
          const fullOriginalText = accumulatedTextRef.current
            ? accumulatedTextRef.current.trim() + ' ' + finalTranscribedText.trim()
            : finalTranscribedText.trim();

          // Process through polish/translate
          let resultText = '';

          if (opts.type === 'polish') {
            const result = await polishApi.polishText(
              fullOriginalText,
              opts.language || 'en',
              opts.outputFormat || 'professional',
              opts.outputType || 'general'
            );
            resultText = result.polishedText;
          } else {
            const result = await translateApi.translateText(
              fullOriginalText,
              opts.sourceLanguage || 'en',
              opts.targetLanguage || 'es',
              opts.outputFormat || 'professional'
            );
            // Use polishedText as the main result (this is the polished translation)
            resultText = result.polishedText;
          }

          accumulatedTextRef.current = fullOriginalText;
          processedResultRef.current = resultText;
          setState(prev => ({
            ...prev,
            accumulatedOriginalText: fullOriginalText,
            processedResult: resultText,
            isProcessingChunk: false,
            processingProgress: 100,
          }));

          opts.onResultUpdated?.(fullOriginalText, resultText);

          return {
            originalText: fullOriginalText,
            resultText,
          };

        } catch (error) {
          console.error('[ChunkedRecording] Final segment processing failed:', error);

          // Return accumulated text even if final processing fails
          setState(prev => ({
            ...prev,
            isProcessingChunk: false,
          }));

          return {
            originalText: accumulatedTextRef.current,
            resultText: processedResultRef.current,
          };
        }
      }

      // Return current accumulated results if no final segment to process
      return {
        originalText: accumulatedTextRef.current,
        resultText: processedResultRef.current,
      };

    } catch (error) {
      ErrorReporter.report(error as Error, 'useChunkedRecording.stopRecording');
      setState(prev => ({
        ...prev,
        isRecording: false,
        isProcessingChunk: false,
      }));
      throw error;
    }
  }, [state.currentDuration]);

  /**
   * Pause recording (not fully supported by expo-av, stops recording)
   */
  const pauseRecording = useCallback(async () => {
    // Note: expo-av doesn't support true pause, so we'll stop and save state
    console.log('[ChunkedRecording] Pause not fully supported - use stop/resume pattern');
  }, []);

  /**
   * Resume recording (starts a new recording session)
   */
  const resumeRecording = useCallback(async () => {
    // Continue from current accumulated state
    await startRecording();
  }, [startRecording]);

  /**
   * Cancel recording and discard all data
   */
  const cancelRecording = useCallback(async () => {
    const sentinel = recordingPersistenceManager.getActiveSentinel();

    await cleanup();

    if (sentinel) {
      await recordingPersistenceManager.finalize();
      await recordingPersistenceManager.discardSession(sentinel.sessionId);
    }

    setState({
      isRecording: false,
      currentDuration: 0,
      chunks: [],
      accumulatedOriginalText: '',
      processedResult: '',
      isProcessingChunk: false,
      currentChunkIndex: 0,
      processingProgress: 0,
    });

    sessionIdRef.current = '';
    lastProcessedDurationRef.current = 0;
    pendingChunksQueueRef.current = [];
    persistenceSegmentIndexRef.current = 0;
    accumulatedTextRef.current = '';
    processedResultRef.current = '';

    secureLog.debug('[ChunkedRecording] Recording cancelled');
  }, [cleanup]);

  /**
   * Manually trigger processing of current chunk
   */
  const processCurrentChunk = useCallback(async () => {
    const currentIndex = state.chunks.length;
    await extractAndProcessChunk(currentIndex);
  }, [state.chunks.length, extractAndProcessChunk]);

  /**
   * Retry all failed chunks
   */
  const retryFailedChunks = useCallback(async () => {
    const failedChunks = state.chunks.filter(c => c.status === 'failed' && c.base64Audio);

    console.log(`[ChunkedRecording] Retrying ${failedChunks.length} failed chunks`);

    for (const chunk of failedChunks) {
      chunk.retryCount = 0; // Reset retry count
      await processChunkInBackground(chunk);
    }
  }, [state.chunks]);

  /**
   * Append external text to accumulated text (for "Continue" mode)
   */
  const appendToAccumulatedText = useCallback((text: string) => {
    setState(prev => ({
      ...prev,
      accumulatedOriginalText: prev.accumulatedOriginalText
        ? prev.accumulatedOriginalText.trim() + ' ' + text.trim()
        : text.trim(),
    }));
  }, []);

  /**
   * Clear all state
   */
  const clearState = useCallback(() => {
    setState({
      isRecording: false,
      currentDuration: 0,
      chunks: [],
      accumulatedOriginalText: '',
      processedResult: '',
      isProcessingChunk: false,
      currentChunkIndex: 0,
      processingProgress: 0,
    });

    sessionIdRef.current = '';
    lastProcessedDurationRef.current = 0;
    pendingChunksQueueRef.current = [];
  }, []);

  return {
    state,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    cancelRecording,
    emergencyStopAndFinalize,
    processCurrentChunk,
    retryFailedChunks,
    appendToAccumulatedText,
    clearState,
    permissionGranted,
    isOnline,
  };
}

// Helper function
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default useChunkedRecording;
