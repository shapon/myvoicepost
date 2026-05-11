import { useState, useEffect } from 'react';
import { View, Text, Modal, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { THEME_COLORS } from '../lib/constants';
import { autoSaveManager, AutoSaveData } from '../utils/autoSaveManager';
import { recordingPersistenceManager, RecoveryResult } from '../utils/recordingPersistenceManager';
import { secureLog } from '../utils/secureLogger';

interface RecoveryModalProps {
  visible: boolean;
  onRestore: (data: AutoSaveData) => void;
  onDiscard: () => void;
}

interface RecordingRecoveryModalProps {
  visible: boolean;
  recoveryResults: RecoveryResult[];
  onRecover: (sessionId: string, segmentPaths: string[]) => Promise<void>;
  onDiscardRecording: (sessionId: string) => Promise<void>;
  onDismiss: () => void;
}

export function RecoveryModal({ visible, onRestore, onDiscard }: RecoveryModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [recoveryData, setRecoveryData] = useState<AutoSaveData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      loadRecoveryData();
    }
  }, [visible]);

  const loadRecoveryData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const recovery = await autoSaveManager.checkForRecoveryData();

      if (recovery.hasUnsavedData && recovery.lastSession) {
        setRecoveryData(recovery.lastSession);
      } else {
        setError('No recovery data available');
      }
    } catch (err) {
      secureLog.error('[Recovery] Failed to load data:', err);
      setError('Failed to load recovery data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRestore = async () => {
    if (!recoveryData) return;

    try {
      setIsLoading(true);
      const restored = await autoSaveManager.restoreFromRecovery(recoveryData.id);

      if (restored) {
        onRestore(restored);
      } else {
        setError('Failed to restore data');
      }
    } catch (err) {
      secureLog.error('[Recovery] Restore failed:', err);
      setError('Failed to restore data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDiscard = async () => {
    if (!recoveryData) return;

    try {
      setIsLoading(true);
      await autoSaveManager.discardRecovery(recoveryData.id);
      onDiscard();
    } catch (err) {
      secureLog.error('[Recovery] Discard failed:', err);
      setError('Failed to discard data');
    } finally {
      setIsLoading(false);
    }
  };

  const formatTimestamp = (timestamp: number): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    return `${days} day${days > 1 ? 's' : ''} ago`;
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleDiscard}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={THEME_COLORS.primary} />
              <Text style={styles.loadingText}>Loading...</Text>
            </View>
          ) : error ? (
            <View style={styles.errorContainer}>
              <Ionicons name="alert-circle" size={48} color={THEME_COLORS.error} />
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity style={styles.errorButton} onPress={onDiscard}>
                <Text style={styles.errorButtonText}>Close</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <View style={styles.header}>
                <View style={styles.iconContainer}>
                  <Ionicons name="refresh-circle" size={40} color={THEME_COLORS.primary} />
                </View>
                <Text style={styles.title}>Unsaved Work Found</Text>
                <Text style={styles.subtitle}>
                  Would you like to recover your previous session?
                </Text>
              </View>

              {recoveryData && (
                <View style={styles.content}>
                  <View style={styles.infoRow}>
                    <Ionicons name="document-text" size={20} color={THEME_COLORS.textSecondary} />
                    <View style={styles.infoTextContainer}>
                      <Text style={styles.infoLabel}>Type</Text>
                      <Text style={styles.infoValue}>
                        {recoveryData.type === 'polish' ? 'Polish' : 'Translation'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.infoRow}>
                    <Ionicons name="time" size={20} color={THEME_COLORS.textSecondary} />
                    <View style={styles.infoTextContainer}>
                      <Text style={styles.infoLabel}>Last saved</Text>
                      <Text style={styles.infoValue}>
                        {formatTimestamp(recoveryData.timestamp)}
                      </Text>
                    </View>
                  </View>

                  {recoveryData.data.originalText && (
                    <View style={styles.previewContainer}>
                      <Text style={styles.previewLabel}>Original Text:</Text>
                      <Text style={styles.previewText} numberOfLines={3}>
                        {recoveryData.data.originalText}
                      </Text>
                    </View>
                  )}

                  {recoveryData.data.polishedText && (
                    <View style={styles.previewContainer}>
                      <Text style={styles.previewLabel}>Polished Text:</Text>
                      <Text style={styles.previewText} numberOfLines={3}>
                        {recoveryData.data.polishedText}
                      </Text>
                    </View>
                  )}

                  {recoveryData.status === 'processing' && (
                    <View style={styles.warningBox}>
                      <Ionicons name="warning" size={16} color={THEME_COLORS.warning} />
                      <Text style={styles.warningText}>
                        This session was interrupted. Some data may be incomplete.
                      </Text>
                    </View>
                  )}
                </View>
              )}

              <View style={styles.actions}>
                <TouchableOpacity
                  style={[styles.button, styles.restoreButton]}
                  onPress={handleRestore}
                  disabled={isLoading}
                  data-testid="button-restore-autosave"
                >
                  <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
                  <Text style={styles.restoreButtonText}>Restore</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.button, styles.discardButton]}
                  onPress={handleDiscard}
                  disabled={isLoading}
                  data-testid="button-discard-autosave"
                >
                  <Ionicons name="trash" size={20} color={THEME_COLORS.error} />
                  <Text style={styles.discardButtonText}>Discard</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

export function RecordingRecoveryModal({
  visible,
  recoveryResults,
  onRecover,
  onDiscardRecording,
  onDismiss,
}: RecordingRecoveryModalProps) {
  const [processingSessionId, setProcessingSessionId] = useState<string | null>(null);
  const [actionType, setActionType] = useState<'recover' | 'discard' | null>(null);

  const formatDuration = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    }
    return `${seconds}s`;
  };

  const formatTimestamp = (ts: number) => {
    const now = new Date();
    const diffMs = now.getTime() - ts;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    return new Date(ts).toLocaleDateString();
  };

  const handleRecover = async (result: RecoveryResult) => {
    setProcessingSessionId(result.sessionId);
    setActionType('recover');
    try {
      const segmentPaths = await recordingPersistenceManager.recoverSession(result.sessionId);
      if (segmentPaths) {
        await onRecover(result.sessionId, segmentPaths);
      }
    } catch (error) {
      secureLog.error('[RecordingRecoveryModal] Recovery failed:', error);
    } finally {
      setProcessingSessionId(null);
      setActionType(null);
    }
  };

  const handleDiscard = async (result: RecoveryResult) => {
    setProcessingSessionId(result.sessionId);
    setActionType('discard');
    try {
      await recordingPersistenceManager.discardSession(result.sessionId);
      await onDiscardRecording(result.sessionId);
    } catch (error) {
      secureLog.error('[RecordingRecoveryModal] Discard failed:', error);
    } finally {
      setProcessingSessionId(null);
      setActionType(null);
    }
  };

  if (recoveryResults.length === 0) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onDismiss}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <View style={styles.headerIconRow}>
              <Ionicons name="alert-circle" size={28} color={THEME_COLORS.warning || '#FFA500'} />
              <Text style={styles.title}>Recording Recovery</Text>
            </View>
            <Text style={styles.subtitle}>
              Found {recoveryResults.length} unsaved recording{recoveryResults.length !== 1 ? 's' : ''} from a previous session.
            </Text>
          </View>

          <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
            {recoveryResults.map((result) => {
              const isProcessing = processingSessionId === result.sessionId;

              return (
                <View key={result.sessionId} style={styles.sessionCard}>
                  <View style={styles.sessionInfo}>
                    <View style={styles.sessionDetailRow}>
                      <Ionicons name="time-outline" size={16} color={THEME_COLORS.textSecondary} />
                      <Text style={styles.sessionDetail}>
                        Started {formatTimestamp(result.sentinel.startTime)}
                      </Text>
                    </View>
                    <View style={styles.sessionDetailRow}>
                      <Ionicons name="recording-outline" size={16} color={THEME_COLORS.textSecondary} />
                      <Text style={styles.sessionDetail}>
                        Duration: {formatDuration(result.totalRecoveredDurationMs)}
                      </Text>
                    </View>
                    <View style={styles.sessionDetailRow}>
                      <Ionicons name="layers-outline" size={16} color={THEME_COLORS.textSecondary} />
                      <Text style={styles.sessionDetail}>
                        {result.availableSegments.length} segment{result.availableSegments.length !== 1 ? 's' : ''} recovered
                      </Text>
                    </View>
                    <View style={styles.sessionDetailRow}>
                      <Ionicons name="mic-outline" size={16} color={THEME_COLORS.textSecondary} />
                      <Text style={styles.sessionDetail}>
                        Type: {result.sentinel.recordingType === 'chunked' ? 'Long recording' : 'Short recording'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.actions}>
                    <TouchableOpacity
                      style={[styles.button, styles.restoreButton, isProcessing && styles.disabledButton]}
                      onPress={() => handleRecover(result)}
                      disabled={isProcessing}
                      data-testid={`button-recover-recording-${result.sessionId}`}
                    >
                      {isProcessing && actionType === 'recover' ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <>
                          <Ionicons name="checkmark-circle" size={18} color="#fff" />
                          <Text style={styles.restoreButtonText}>Recover</Text>
                        </>
                      )}
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.button, styles.discardButton, isProcessing && styles.disabledButton]}
                      onPress={() => handleDiscard(result)}
                      disabled={isProcessing}
                      data-testid={`button-discard-recording-${result.sessionId}`}
                    >
                      {isProcessing && actionType === 'discard' ? (
                        <ActivityIndicator size="small" color={THEME_COLORS.error || '#FF4444'} />
                      ) : (
                        <>
                          <Ionicons name="trash-outline" size={18} color={THEME_COLORS.error || '#FF4444'} />
                          <Text style={styles.discardButtonText}>Discard</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </ScrollView>

          <TouchableOpacity
            style={styles.dismissButton}
            onPress={onDismiss}
            data-testid="button-dismiss-recording-recovery"
          >
            <Text style={styles.dismissText}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modal: {
    backgroundColor: THEME_COLORS.surface,
    borderRadius: 16,
    width: '100%',
    maxWidth: 400,
    padding: 24,
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  loadingContainer: {
    alignItems: 'center',
    padding: 32,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: THEME_COLORS.text,
  },
  errorContainer: {
    alignItems: 'center',
    padding: 24,
  },
  errorText: {
    marginTop: 16,
    fontSize: 16,
    color: THEME_COLORS.text,
    textAlign: 'center',
    marginBottom: 24,
  },
  errorButton: {
    backgroundColor: THEME_COLORS.primary,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  errorButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  headerIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  iconContainer: {
    marginBottom: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: THEME_COLORS.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: THEME_COLORS.textSecondary,
    textAlign: 'center',
  },
  content: {
    marginBottom: 24,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  infoTextContainer: {
    marginLeft: 12,
    flex: 1,
  },
  infoLabel: {
    fontSize: 12,
    color: THEME_COLORS.textSecondary,
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 16,
    color: THEME_COLORS.text,
    fontWeight: '500',
  },
  previewContainer: {
    backgroundColor: THEME_COLORS.background,
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  previewLabel: {
    fontSize: 12,
    color: THEME_COLORS.textSecondary,
    marginBottom: 6,
    fontWeight: '600',
  },
  previewText: {
    fontSize: 14,
    color: THEME_COLORS.text,
    lineHeight: 20,
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF3CD',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FFD700',
  },
  warningText: {
    marginLeft: 8,
    fontSize: 13,
    color: '#856404',
    flex: 1,
  },
  scrollArea: {
    maxHeight: 400,
  },
  sessionCard: {
    backgroundColor: THEME_COLORS.background,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: THEME_COLORS.border || 'rgba(255,255,255,0.1)',
  },
  sessionInfo: {
    marginBottom: 14,
    gap: 6,
  },
  sessionDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sessionDetail: {
    fontSize: 13,
    color: THEME_COLORS.textSecondary,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 8,
    gap: 8,
  },
  restoreButton: {
    backgroundColor: THEME_COLORS.primary,
  },
  restoreButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  discardButton: {
    backgroundColor: THEME_COLORS.background,
    borderWidth: 1,
    borderColor: THEME_COLORS.border,
  },
  discardButtonText: {
    color: THEME_COLORS.error,
    fontSize: 16,
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.5,
  },
  dismissButton: {
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 8,
  },
  dismissText: {
    color: THEME_COLORS.textSecondary,
    fontSize: 14,
  },
});
