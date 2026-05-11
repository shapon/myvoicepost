/**
 * Chunked Recording Integration Test
 *
 * This file provides test utilities to verify the chunked recording
 * functionality works correctly.
 *
 * To run: Import this in a development build and call the test functions
 */

import { useChunkedRecording, ChunkInfo, ChunkedRecordingState } from '../hooks/useChunkedRecording';

/**
 * Mock test for chunk processing flow
 */
export function logChunkedRecordingState(state: ChunkedRecordingState): void {
  console.log('='.repeat(60));
  console.log('[ChunkedRecording Test] Current State:');
  console.log('  isRecording:', state.isRecording);
  console.log('  currentDuration:', state.currentDuration, 'seconds');
  console.log('  isProcessingChunk:', state.isProcessingChunk);
  console.log('  currentChunkIndex:', state.currentChunkIndex);
  console.log('  processingProgress:', state.processingProgress, '%');
  console.log('  chunks:', state.chunks.length);
  console.log('  accumulatedOriginalText length:', state.accumulatedOriginalText.length);
  console.log('  processedResult length:', state.processedResult.length);

  if (state.chunks.length > 0) {
    console.log('\n  Chunk Details:');
    state.chunks.forEach((chunk: ChunkInfo) => {
      console.log(`    Chunk ${chunk.index}: ${chunk.status}`);
      if (chunk.error) {
        console.log(`      Error: ${chunk.error}`);
      }
      if (chunk.transcribedText) {
        console.log(`      Text: ${chunk.transcribedText.substring(0, 30)}...`);
      }
    });
  }
  console.log('='.repeat(60));
}

/**
 * Validate chunk processing results
 */
export function validateChunkResults(state: ChunkedRecordingState): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check for failed chunks
  const failedChunks = state.chunks.filter(c => c.status === 'failed');
  if (failedChunks.length > 0) {
    warnings.push(`${failedChunks.length} chunk(s) failed processing`);
  }

  // Check for pending chunks when not recording
  if (!state.isRecording) {
    const pendingChunks = state.chunks.filter(c => c.status === 'pending');
    if (pendingChunks.length > 0) {
      warnings.push(`${pendingChunks.length} chunk(s) still pending after recording stopped`);
    }
  }

  // Validate accumulated text
  if (state.chunks.length > 0 && state.accumulatedOriginalText.length === 0) {
    errors.push('Chunks exist but no accumulated text');
  }

  // Check chunk order
  for (let i = 1; i < state.chunks.length; i++) {
    if (state.chunks[i].index !== state.chunks[i - 1].index + 1) {
      errors.push(`Chunk order mismatch at index ${i}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Test scenarios for chunked recording
 */
export const ChunkedRecordingTestScenarios = {
  /**
   * Test 1: Short recording (< 60s) - should not trigger chunking
   */
  shortRecording: {
    name: 'Short Recording',
    duration: 30,
    expectedChunks: 0,
    description: 'Recording under 60 seconds should use simple mode',
  },

  /**
   * Test 2: Medium recording (60-120s) - should trigger 1 chunk
   */
  mediumRecording: {
    name: 'Medium Recording',
    duration: 90,
    expectedChunks: 1,
    description: 'Recording between 60-120 seconds should process 1 chunk',
  },

  /**
   * Test 3: Long recording (2-3 min) - should trigger 2-3 chunks
   */
  longRecording: {
    name: 'Long Recording',
    duration: 180,
    expectedChunks: 3,
    description: 'Recording 3 minutes should process approximately 3 chunks',
  },

  /**
   * Test 4: Offline scenario
   */
  offlineRecording: {
    name: 'Offline Recording',
    simulateOffline: true,
    description: 'Chunks should be queued when offline',
  },

  /**
   * Test 5: Continue mode
   */
  continueMode: {
    name: 'Continue Mode',
    existingText: 'This is existing text.',
    description: 'New recording should append to existing text',
  },
};

/**
 * Debug helper to simulate chunk processing
 */
export function simulateChunkProcessing(chunkIndex: number): ChunkInfo {
  return {
    id: `test_chunk_${chunkIndex}`,
    index: chunkIndex,
    startTime: chunkIndex * 60,
    endTime: (chunkIndex + 1) * 60,
    status: 'completed',
    transcribedText: `This is simulated transcription for chunk ${chunkIndex}.`,
    retryCount: 0,
  };
}

/**
 * Performance metrics for chunk processing
 */
export interface ChunkProcessingMetrics {
  chunkIndex: number;
  processingStartTime: number;
  processingEndTime: number;
  transcriptionDuration: number;
  polishDuration: number;
  totalDuration: number;
}

export function measureChunkProcessing(
  chunkIndex: number,
  startTime: number,
  transcribeEndTime: number,
  polishEndTime: number
): ChunkProcessingMetrics {
  return {
    chunkIndex,
    processingStartTime: startTime,
    processingEndTime: polishEndTime,
    transcriptionDuration: transcribeEndTime - startTime,
    polishDuration: polishEndTime - transcribeEndTime,
    totalDuration: polishEndTime - startTime,
  };
}

export default {
  logChunkedRecordingState,
  validateChunkResults,
  ChunkedRecordingTestScenarios,
  simulateChunkProcessing,
  measureChunkProcessing,
};
