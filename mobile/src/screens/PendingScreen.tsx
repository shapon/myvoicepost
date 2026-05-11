import { useState, useEffect, useCallback, memo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, RefreshControl, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../components/ui/Card';
import { THEME_COLORS, LANGUAGES } from '../lib/constants';
import { pendingProcessor, PendingItem, ProcessingResult } from '../utils/pendingProcessor';

const languageMap = new Map(LANGUAGES.map(l => [l.code, `${l.flag} ${l.name}`]));
const getLanguageName = (code?: string) => {
  if (!code) return '';
  return languageMap.get(code) || code;
};

const getItemTypeLabel = (type: string) => {
  switch (type) {
    case 'polish_audio': return 'Polish (Audio)';
    case 'polish_text': return 'Polish (Text)';
    case 'translate_audio': return 'Translate (Audio)';
    case 'translate_text': return 'Translate (Text)';
    default: return type;
  }
};

const getItemIcon = (type: string) => type.includes('audio') ? 'mic' : 'text';

export function PendingScreen() {
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [processedResults, setProcessedResults] = useState<Map<string, ProcessingResult>>(new Map());

  useEffect(() => {
    loadItems();
    checkOnlineStatus();
    
    const unsubscribe = pendingProcessor.subscribe((items) => {
      setPendingItems(items);
    });

    return unsubscribe;
  }, []);

  const loadItems = async () => {
    const items = await pendingProcessor.getItems();
    setPendingItems(items);
  };

  const checkOnlineStatus = async () => {
    const online = await pendingProcessor.isOnline();
    setIsOnline(online);
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadItems();
    await checkOnlineStatus();
    setRefreshing(false);
  }, []);

  const handleProcess = useCallback(async (item: PendingItem) => {
    const online = await pendingProcessor.isOnline();
    if (!online) {
      Alert.alert('No Connection', 'Please check your internet connection and try again.');
      return;
    }

    setProcessingId(item.id);

    try {
      const result = await pendingProcessor.processItem(item.id);
      
      if (result.success) {
        // Store result for display
        setProcessedResults(prev => {
          const newMap = new Map(prev);
          newMap.set(item.id, result);
          return newMap;
        });
        
        Alert.alert(
          'Processed Successfully',
          `Your ${item.type.includes('translate') ? 'translation' : 'polish'} is ready!`,
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert('Processing Failed', result.error || 'Please try again later.');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to process item');
    } finally {
      setProcessingId(null);
    }
  }, []);

  const handleProcessAll = async () => {
    const online = await pendingProcessor.isOnline();
    if (!online) {
      Alert.alert('No Connection', 'Please check your internet connection and try again.');
      return;
    }

    if (pendingItems.length === 0) {
      Alert.alert('No Items', 'There are no pending items to process.');
      return;
    }

    Alert.alert(
      'Process All',
      `Process all ${pendingItems.length} pending items?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Process All',
          onPress: async () => {
            setProcessingId('all');
            try {
              const result = await pendingProcessor.processAll();
              Alert.alert(
                'Processing Complete',
                `Processed: ${result.success}\nFailed: ${result.failed}`,
                [{ text: 'OK' }]
              );
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to process items');
            } finally {
              setProcessingId(null);
            }
          },
        },
      ]
    );
  };

  const handleDelete = useCallback(async (item: PendingItem) => {
    Alert.alert(
      'Delete Item',
      'Are you sure you want to delete this pending item? The recording will be lost.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await pendingProcessor.removeItem(item.id);
            loadItems();
          },
        },
      ]
    );
  }, []);

  const renderItem = useCallback(({ item }: { item: PendingItem }) => {
    const isProcessingThis = processingId === item.id || processingId === 'all';
    
    return (
      <Card style={styles.itemCard}>
        <View style={styles.itemHeader}>
          <View style={styles.itemType}>
            <Ionicons
              name={getItemIcon(item.type)}
              size={18}
              color={item.type.includes('translate') ? THEME_COLORS.secondary : THEME_COLORS.primary}
            />
            <Text style={styles.itemTypeText}>
              {getItemTypeLabel(item.type)}
            </Text>
          </View>
          <View style={styles.itemActions}>
            <TouchableOpacity 
              onPress={() => handleProcess(item)} 
              style={styles.processButton}
              disabled={isProcessingThis || !isOnline}
            >
              {isProcessingThis ? (
                <ActivityIndicator size="small" color={THEME_COLORS.primary} />
              ) : (
                <Ionicons 
                  name="play-circle" 
                  size={24} 
                  color={isOnline ? THEME_COLORS.primary : THEME_COLORS.textMuted} 
                />
              )}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleDelete(item)} style={styles.deleteButton}>
              <Ionicons name="trash-outline" size={20} color={THEME_COLORS.error} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.itemMeta}>
          <Text style={styles.metaText}>
            {item.type.includes('translate') 
              ? `${getLanguageName(item.sourceLanguage)} → ${getLanguageName(item.targetLanguage)}`
              : getLanguageName(item.language || item.sourceLanguage)
            }
          </Text>
          <Text style={styles.metaDate}>
            {new Date(item.createdAt).toLocaleString()}
          </Text>
        </View>

        {item.originalText && (
          <View style={styles.itemContent}>
            <Text style={styles.contentLabel}>Text:</Text>
            <Text style={styles.contentText} numberOfLines={2}>
              {item.originalText}
            </Text>
          </View>
        )}

        {item.audioUri && (
          <View style={styles.audioIndicator}>
            <Ionicons name="volume-high" size={16} color={THEME_COLORS.textSecondary} />
            <Text style={styles.audioText}>Audio recording ready</Text>
          </View>
        )}

        {item.attempts > 0 && (
          <View style={styles.attemptInfo}>
            <Ionicons name="warning" size={14} color={THEME_COLORS.warning} />
            <Text style={styles.attemptText}>
              {item.attempts} failed attempt{item.attempts > 1 ? 's' : ''}
              {item.lastError && `: ${item.lastError}`}
            </Text>
          </View>
        )}
      </Card>
    );
  }, [processingId, isOnline, handleProcess, handleDelete]);

  const keyExtractor = useCallback((item: PendingItem) => item.id, []);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Pending Items</Text>
          {!isOnline && (
            <View style={styles.offlineBadge}>
              <Ionicons name="cloud-offline" size={14} color={THEME_COLORS.error} />
              <Text style={styles.offlineText}>Offline</Text>
            </View>
          )}
        </View>
        <View style={styles.headerActions}>
          <Text style={styles.count}>{pendingItems.length} items</Text>
          {pendingItems.length > 0 && (
            <TouchableOpacity 
              style={[styles.processAllButton, !isOnline && styles.processAllButtonDisabled]}
              onPress={handleProcessAll}
              disabled={!isOnline || processingId !== null}
            >
              {processingId === 'all' ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="play" size={14} color="#fff" />
                  <Text style={styles.processAllText}>Process All</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>

      {pendingItems.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="hourglass-outline" size={64} color={THEME_COLORS.textMuted} />
          <Text style={styles.emptyTitle}>No Pending Items</Text>
          <Text style={styles.emptyText}>
            When you record while offline, your recordings will appear here for processing later.
          </Text>
        </View>
      ) : (
        <FlatList
          data={pendingItems}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.listContent}
          removeClippedSubviews={true}
          maxToRenderPerBatch={10}
          windowSize={5}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={THEME_COLORS.primary}
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME_COLORS.background,
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: THEME_COLORS.border,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: THEME_COLORS.text,
  },
  offlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: THEME_COLORS.errorLight || '#fee2e2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  offlineText: {
    fontSize: 12,
    color: THEME_COLORS.error,
    fontWeight: '500',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  count: {
    fontSize: 14,
    color: THEME_COLORS.textSecondary,
  },
  processAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: THEME_COLORS.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  processAllButtonDisabled: {
    backgroundColor: THEME_COLORS.textMuted,
  },
  processAllText: {
    fontSize: 13,
    color: '#fff',
    fontWeight: '500',
  },
  listContent: {
    padding: 16,
    paddingBottom: 100,
  },
  itemCard: {
    marginBottom: 16,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  itemType: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  itemTypeText: {
    fontSize: 12,
    fontWeight: '600',
    color: THEME_COLORS.textSecondary,
    textTransform: 'uppercase',
  },
  itemActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  processButton: {
    padding: 4,
  },
  deleteButton: {
    padding: 4,
  },
  itemMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  metaText: {
    fontSize: 13,
    color: THEME_COLORS.textSecondary,
  },
  metaDate: {
    fontSize: 12,
    color: THEME_COLORS.textMuted,
  },
  itemContent: {
    marginTop: 8,
  },
  contentLabel: {
    fontSize: 12,
    color: THEME_COLORS.textMuted,
    marginBottom: 4,
  },
  contentText: {
    fontSize: 14,
    color: THEME_COLORS.text,
    lineHeight: 20,
  },
  audioIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    padding: 8,
    backgroundColor: THEME_COLORS.surface || '#f5f5f5',
    borderRadius: 8,
  },
  audioText: {
    fontSize: 13,
    color: THEME_COLORS.textSecondary,
  },
  attemptInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
    padding: 6,
    backgroundColor: '#fef3c7',
    borderRadius: 6,
  },
  attemptText: {
    fontSize: 12,
    color: THEME_COLORS.warning || '#b45309',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: THEME_COLORS.text,
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 15,
    color: THEME_COLORS.textSecondary,
    textAlign: 'center',
  },
});
