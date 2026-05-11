import * as FileSystem from 'expo-file-system';
import { secureLog } from './secureLogger';

export interface SentinelFile {
  sessionId: string;
  startTime: number;
  tempDirPath: string;
  segments: SegmentInfo[];
  lastSegmentTime: number;
  totalDurationMs: number;
  isFinalized: boolean;
  finalizedAt?: number;
  recordingType: 'simple' | 'chunked';
  metadata: Record<string, string>;
}

export interface SegmentInfo {
  index: number;
  fileName: string;
  filePath: string;
  startTimeMs: number;
  durationMs: number;
  sizeBytes: number;
  isComplete: boolean;
}

export interface RecoveryResult {
  sessionId: string;
  sentinelPath: string;
  sentinel: SentinelFile;
  availableSegments: SegmentInfo[];
  totalRecoveredDurationMs: number;
  segmentPaths: string[];
}

const PERSISTENCE_DIR = 'recording_persistence';
const SENTINEL_FILE_NAME = 'sentinel.json';
const SEGMENT_PREFIX = 'seg_';
const SEGMENT_INTERVAL_MS = 5000;

class RecordingPersistenceManager {
  private static instance: RecordingPersistenceManager;
  private activeSentinel: SentinelFile | null = null;
  private activeSentinelPath: string | null = null;
  private baseDir: string;

  private constructor() {
    this.baseDir = `${FileSystem.cacheDirectory}${PERSISTENCE_DIR}/`;
  }

  static getInstance(): RecordingPersistenceManager {
    if (!RecordingPersistenceManager.instance) {
      RecordingPersistenceManager.instance = new RecordingPersistenceManager();
    }
    return RecordingPersistenceManager.instance;
  }

  getSegmentIntervalMs(): number {
    return SEGMENT_INTERVAL_MS;
  }

  async ensureBaseDir(): Promise<void> {
    const info = await FileSystem.getInfoAsync(this.baseDir);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(this.baseDir, { intermediates: true });
    }
  }

  async startSession(
    recordingType: 'simple' | 'chunked',
    metadata: Record<string, string> = {}
  ): Promise<{ sessionId: string; sessionDir: string }> {
    await this.ensureBaseDir();

    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    const sessionDir = `${this.baseDir}${sessionId}/`;

    await FileSystem.makeDirectoryAsync(sessionDir, { intermediates: true });

    const sentinel: SentinelFile = {
      sessionId,
      startTime: Date.now(),
      tempDirPath: sessionDir,
      segments: [],
      lastSegmentTime: Date.now(),
      totalDurationMs: 0,
      isFinalized: false,
      recordingType,
      metadata,
    };

    const sentinelPath = `${sessionDir}${SENTINEL_FILE_NAME}`;
    await FileSystem.writeAsStringAsync(sentinelPath, JSON.stringify(sentinel, null, 2));

    this.activeSentinel = sentinel;
    this.activeSentinelPath = sentinelPath;

    secureLog.debug('[PersistenceManager] Session started:', sessionId);
    return { sessionId, sessionDir };
  }

  async registerSegment(
    uri: string,
    index: number,
    startTimeMs: number,
    durationMs: number
  ): Promise<string> {
    if (!this.activeSentinel || !this.activeSentinelPath) {
      throw new Error('No active recording session');
    }

    const sessionDir = this.activeSentinel.tempDirPath;
    const fileName = `${SEGMENT_PREFIX}${index.toString().padStart(4, '0')}.m4a`;
    const destPath = `${sessionDir}${fileName}`;

    await FileSystem.copyAsync({ from: uri, to: destPath });

    const fileInfo = await FileSystem.getInfoAsync(destPath);
    const sizeBytes = fileInfo.exists && 'size' in fileInfo ? (fileInfo.size || 0) : 0;

    const segmentInfo: SegmentInfo = {
      index,
      fileName,
      filePath: destPath,
      startTimeMs,
      durationMs,
      sizeBytes,
      isComplete: true,
    };

    this.activeSentinel.segments.push(segmentInfo);
    this.activeSentinel.lastSegmentTime = Date.now();
    this.activeSentinel.totalDurationMs += durationMs;

    await this.flushSentinel();

    secureLog.debug(
      `[PersistenceManager] Segment ${index} registered: ${fileName} (${sizeBytes} bytes, ${durationMs}ms)`
    );

    return destPath;
  }

  async finalize(): Promise<SentinelFile | null> {
    if (!this.activeSentinel || !this.activeSentinelPath) {
      secureLog.warn('[PersistenceManager] No active session to finalize');
      return null;
    }

    this.activeSentinel.isFinalized = true;
    this.activeSentinel.finalizedAt = Date.now();

    await this.flushSentinel();

    const finalized = { ...this.activeSentinel };

    secureLog.debug(
      `[PersistenceManager] Session finalized: ${finalized.sessionId}, ${finalized.segments.length} segments`
    );

    this.activeSentinel = null;
    this.activeSentinelPath = null;

    return finalized;
  }

  async emergencyFinalize(): Promise<SentinelFile | null> {
    secureLog.warn('[PersistenceManager] Emergency finalize triggered');
    return this.finalize();
  }

  getActiveSentinel(): SentinelFile | null {
    return this.activeSentinel ? { ...this.activeSentinel } : null;
  }

  isSessionActive(): boolean {
    return this.activeSentinel !== null && !this.activeSentinel.isFinalized;
  }

  async scanForUnfinalizedSessions(): Promise<RecoveryResult[]> {
    const results: RecoveryResult[] = [];

    try {
      await this.ensureBaseDir();
      const baseDirContents = await FileSystem.readDirectoryAsync(this.baseDir);

      for (const dirName of baseDirContents) {
        if (!dirName.startsWith('session_')) continue;

        const sessionDir = `${this.baseDir}${dirName}/`;
        const sentinelPath = `${sessionDir}${SENTINEL_FILE_NAME}`;

        try {
          const sentinelInfo = await FileSystem.getInfoAsync(sentinelPath);
          if (!sentinelInfo.exists) continue;

          const sentinelStr = await FileSystem.readAsStringAsync(sentinelPath);
          const sentinel: SentinelFile = JSON.parse(sentinelStr);

          if (sentinel.isFinalized) {
            const age = Date.now() - (sentinel.finalizedAt || sentinel.startTime);
            if (age > 24 * 60 * 60 * 1000) {
              await this.cleanupSession(sessionDir);
            }
            continue;
          }

          if (this.activeSentinel && this.activeSentinel.sessionId === sentinel.sessionId) {
            continue;
          }

          const availableSegments: SegmentInfo[] = [];
          const segmentPaths: string[] = [];

          for (const seg of sentinel.segments) {
            const segInfo = await FileSystem.getInfoAsync(seg.filePath);
            if (segInfo.exists) {
              availableSegments.push(seg);
              segmentPaths.push(seg.filePath);
            }
          }

          if (availableSegments.length > 0) {
            const totalRecoveredDurationMs = availableSegments.reduce(
              (sum, s) => sum + s.durationMs,
              0
            );

            results.push({
              sessionId: sentinel.sessionId,
              sentinelPath,
              sentinel,
              availableSegments,
              totalRecoveredDurationMs,
              segmentPaths,
            });
          } else {
            await this.cleanupSession(sessionDir);
          }
        } catch (error) {
          secureLog.error(`[PersistenceManager] Error scanning session ${dirName}:`, error);
        }
      }
    } catch (error) {
      secureLog.error('[PersistenceManager] Error scanning for unfinalized sessions:', error);
    }

    return results;
  }

  async recoverSession(sessionId: string): Promise<string[] | null> {
    const results = await this.scanForUnfinalizedSessions();
    const recovery = results.find((r) => r.sessionId === sessionId);
    if (!recovery) return null;

    const sentinelStr = await FileSystem.readAsStringAsync(recovery.sentinelPath);
    const sentinel: SentinelFile = JSON.parse(sentinelStr);
    sentinel.isFinalized = true;
    sentinel.finalizedAt = Date.now();
    await FileSystem.writeAsStringAsync(recovery.sentinelPath, JSON.stringify(sentinel, null, 2));

    secureLog.debug(
      `[PersistenceManager] Session recovered: ${sessionId}, ${recovery.segmentPaths.length} segments`
    );

    return recovery.segmentPaths;
  }

  async getRecoveredSegmentsAsBase64(segmentPaths: string[]): Promise<string[]> {
    const base64Segments: string[] = [];
    for (const path of segmentPaths) {
      try {
        const base64 = await FileSystem.readAsStringAsync(path, {
          encoding: FileSystem.EncodingType.Base64,
        });
        base64Segments.push(base64);
      } catch (error) {
        secureLog.error(`[PersistenceManager] Failed to read segment: ${path}`, error);
      }
    }
    return base64Segments;
  }

  async scanForRecovery(): Promise<RecoveryResult[]> {
    return this.scanForUnfinalizedSessions();
  }

  async discardSession(sessionId: string): Promise<void> {
    const sessionDir = `${this.baseDir}${sessionId}/`;
    await this.cleanupSession(sessionDir);
    secureLog.debug(`[PersistenceManager] Session discarded: ${sessionId}`);
  }

  async cleanupSession(sessionDir: string): Promise<void> {
    try {
      const info = await FileSystem.getInfoAsync(sessionDir);
      if (info.exists) {
        await FileSystem.deleteAsync(sessionDir, { idempotent: true });
      }
    } catch (error) {
      secureLog.error('[PersistenceManager] Cleanup failed:', error);
    }
  }

  async cleanupFinalizedSessions(): Promise<number> {
    let cleaned = 0;
    try {
      await this.ensureBaseDir();
      const baseDirContents = await FileSystem.readDirectoryAsync(this.baseDir);

      for (const dirName of baseDirContents) {
        if (!dirName.startsWith('session_')) continue;

        const sessionDir = `${this.baseDir}${dirName}/`;
        const sentinelPath = `${sessionDir}${SENTINEL_FILE_NAME}`;

        try {
          const sentinelInfo = await FileSystem.getInfoAsync(sentinelPath);
          if (!sentinelInfo.exists) {
            await this.cleanupSession(sessionDir);
            cleaned++;
            continue;
          }

          const sentinelStr = await FileSystem.readAsStringAsync(sentinelPath);
          const sentinel: SentinelFile = JSON.parse(sentinelStr);

          if (sentinel.isFinalized) {
            await this.cleanupSession(sessionDir);
            cleaned++;
          }
        } catch {
          await this.cleanupSession(sessionDir);
          cleaned++;
        }
      }
    } catch (error) {
      secureLog.error('[PersistenceManager] Cleanup finalized sessions failed:', error);
    }
    return cleaned;
  }

  private async flushSentinel(): Promise<void> {
    if (!this.activeSentinel || !this.activeSentinelPath) return;

    try {
      await FileSystem.writeAsStringAsync(
        this.activeSentinelPath,
        JSON.stringify(this.activeSentinel, null, 2)
      );
    } catch (error) {
      secureLog.error('[PersistenceManager] Failed to flush sentinel:', error);
    }
  }
}

export const recordingPersistenceManager = RecordingPersistenceManager.getInstance();
