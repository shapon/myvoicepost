import { useState, useCallback, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, RefreshControl, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import * as FileSystem from 'expo-file-system';
import { savedItemsApi, SavedItem, polishApi, translateApi } from '../../src/lib/api';
import { Card } from '../../src/components/ui/Card';
import { LANGUAGES, THEME_COLORS } from '../../src/lib/constants';
import { useAuth } from '../../src/contexts/AuthContext';
import { Button } from '../../src/components/ui/Button';
import { useEditingSavedItem } from '../../src/contexts/EditingSavedItemContext';
import { offlineQueue, PendingChunkGroup } from '../../src/utils/offlineQueue';

type TabType = 'polish' | 'translate' | 'pending';

export default function StorageScreen() {
  const { isAuthenticated, user } = useAuth();
  const queryClient = useQueryClient();
  const router = useRouter();
  const { setEditingItem } = useEditingSavedItem();
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('polish');
  const [pendingChunks, setPendingChunks] = useState<PendingChunkGroup[]>([]);
  const [processingGroupId, setProcessingGroupId] = useState<string | null>(null);

  // Fetch pending chunks
  const fetchPendingChunks = useCallback(async () => {
    const chunks = await offlineQueue.getPendingChunksWithDetails();
    setPendingChunks(chunks);
  }, []);

  useEffect(() => {
    fetchPendingChunks();
    
    // Subscribe to queue changes
    const unsubscribe = offlineQueue.subscribe(() => {
      fetchPendingChunks();
    });

    return unsubscribe;
  }, [fetchPendingChunks]);

  const { data: savedItems = [], isLoading, refetch } = useQuery({
    queryKey: ['savedItems', user?.id],
    queryFn: () => savedItemsApi.getAll('all'),
    enabled: isAuthenticated && !!user,
    staleTime: 0,
  });

  const filteredItems = useMemo(() => {
    if (activeTab === 'pending') return [];
    return savedItems.filter(item => item.type === activeTab);
  }, [savedItems, activeTab]);

  const polishCount = useMemo(() => savedItems.filter(item => item.type === 'polish').length, [savedItems]);
  const translateCount = useMemo(() => savedItems.filter(item => item.type === 'translate').length, [savedItems]);
  const pendingCount = pendingChunks.length;

  const deleteMutation = useMutation({
    mutationFn: savedItemsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['savedItems'] });
    },
    onError: () => {
      Alert.alert('Error', 'Failed to delete item');
    },
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetch(), fetchPendingChunks()]);
    setRefreshing(false);
  }, [refetch, fetchPendingChunks]);

  const handleDelete = (id: string) => {
    Alert.alert(
      'Delete Item',
      'Are you sure you want to delete this item?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteMutation.mutate(id),
        },
      ]
    );
  };

  const handleEdit = (item: SavedItem) => {
    setEditingItem(item);
    if (item.type === 'polish') {
      router.push('/(tabs)/');
    } else {
      router.push('/(tabs)/translate');
    }
  };

  const handleProcessPendingChunk = async (group: PendingChunkGroup) => {
    const isOnline = await offlineQueue.isOnline();
    
    if (!isOnline) {
      Alert.alert('Offline', 'Please connect to the internet to process recordings.');
      return;
    }

    setProcessingGroupId(group.id);

    try {
      console.log('[Saved] Processing pending group:', group.id, 'Type:', group.type);

      let combinedOriginalText = '';
      let combinedProcessedText = '';
      let combinedTranslatedText = '';

      const result = await offlineQueue.processChunkGroup(group.id, async (chunk) => {
        console.log('[Saved] Processing chunk:', chunk.id, 'Timestamp:', chunk.timestamp);
        
        // Read chunk file
        const base64Audio = await FileSystem.readAsStringAsync(chunk.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });

        console.log('[Saved] Chunk base64 size:', base64Audio.length, 'chars');

        // Process based on type
        if (chunk.metadata.type === 'polish') {
          const response = await polishApi.polishBase64(
            base64Audio,
            chunk.metadata.language || 'en',
            chunk.metadata.tone || 'professional',
            chunk.metadata.outputType || 'message',
            'audio/mp4'
          );

          console.log('[Saved] Chunk transcribed:', {
            original: response.originalText?.substring(0, 100),
            polished: response.polishedText?.substring(0, 100),
          });

          if (combinedOriginalText) {
            combinedOriginalText += ' ';
            combinedProcessedText += ' ';
          }
          
          combinedOriginalText += (response.originalText || '').trim();
          combinedProcessedText += (response.polishedText || '').trim();

          console.log('[Saved] Combined so far - Original length:', combinedOriginalText.length, 'Polished length:', combinedProcessedText.length);

          return response;
        } else {
          const response = await translateApi.translateBase64(
            base64Audio,
            chunk.metadata.sourceLanguage || 'en',
            chunk.metadata.targetLanguage || 'es',
            chunk.metadata.tone || 'professional',
            'audio/mp4'
          );

          if (combinedOriginalText) {
            combinedOriginalText += ' ';
            combinedTranslatedText += ' ';
            combinedProcessedText += ' ';
          }
          
          combinedOriginalText += (response.originalText || '').trim();
          combinedTranslatedText += (response.translatedText || '').trim();
          combinedProcessedText += (response.polishedText || '').trim();

          return response;
        }
      });

      if (result.success) {
        // Save to saved items
        if (group.type === 'polish') {
          await savedItemsApi.save({
            type: 'polish',
            originalText: combinedOriginalText,
            polishedText: combinedProcessedText,
            sourceLanguage: group.metadata.language || 'en',
            outputFormat: group.metadata.tone || 'professional',
            outputType: group.metadata.outputType || 'message',
          });
        } else {
          await savedItemsApi.save({
            type: 'translate',
            originalText: combinedOriginalText,
            translatedText: combinedTranslatedText,
            polishedText: combinedProcessedText,
            sourceLanguage: group.metadata.sourceLanguage || 'en',
            targetLanguage: group.metadata.targetLanguage || 'es',
            outputFormat: group.metadata.tone || 'professional',
          });
        }

        queryClient.invalidateQueries({ queryKey: ['savedItems'] });
        await fetchPendingChunks();

        Alert.alert(
          'Success',
          `Recording processed and saved to ${group.type === 'polish' ? 'Polish' : 'Translate'} tab`,
          [{ text: 'OK' }]
        );
      } else {
        throw new Error(result.error || 'Processing failed');
      }
    } catch (error: any) {
      console.error('[Saved] Failed to process pending chunk:', error);
      Alert.alert('Error', `Failed to process recording: ${error.message}`);
    } finally {
      setProcessingGroupId(null);
    }
  };

  const handleDeletePendingChunk = (group: PendingChunkGroup) => {
    Alert.alert(
      'Delete Recording',
      'Are you sure you want to delete this pending recording?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await offlineQueue.deleteChunkGroup(group.id);
              await fetchPendingChunks();
              Alert.alert('Deleted', 'Pending recording deleted');
            } catch (error) {
              Alert.alert('Error', 'Failed to delete recording');
            }
          },
        },
      ]
    );
  };

  const getLanguageName = (code: string) => {
    const lang = LANGUAGES.find((l) => l.code === code);
    return lang ? `${lang.flag} ${lang.name}` : code;
  };

  const renderItem = ({ item }: { item: SavedItem }) => (
    <Card style={styles.itemCard}>
      <View style={styles.itemHeader}>
        <View style={styles.actionButtons}>
          <TouchableOpacity 
            onPress={() => handleEdit(item)} 
            style={styles.editButton}
            accessibilityLabel="Edit item"
            data-testid={`button-edit-${item.id}`}
          >
            <Ionicons name="pencil-outline" size={20} color={THEME_COLORS.secondary} />
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={() => handleDelete(item.id)} 
            style={styles.deleteButton}
            accessibilityLabel="Delete item"
            data-testid={`button-delete-${item.id}`}
          >
            <Ionicons name="trash-outline" size={20} color={THEME_COLORS.error} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.itemMeta}>
        <Text style={styles.metaText}>
          {getLanguageName(item.sourceLanguage)}
          {item.targetLanguage && ` -> ${getLanguageName(item.targetLanguage)}`}
        </Text>
        <Text style={styles.metaDate}>
          {new Date(item.createdAt).toLocaleDateString()}
        </Text>
      </View>

      <View style={styles.itemContent}>
        <Text style={styles.contentLabel}>Original:</Text>
        <Text style={styles.contentText} numberOfLines={2}>
          {item.originalText}
        </Text>
      </View>

      <View style={styles.itemContent}>
        <Text style={styles.contentLabelHighlight}>
          {item.type === 'polish' ? 'Polished:' : 'Translated:'}
        </Text>
        <Text style={styles.contentTextHighlight} numberOfLines={3}>
          {item.type === 'translate' ? item.translatedText : item.polishedText}
        </Text>
      </View>
    </Card>
  );

  const renderPendingItem = ({ item }: { item: PendingChunkGroup }) => {
    const isProcessing = processingGroupId === item.id;
    const date = new Date(item.timestamp);
    
    return (
      <Card style={styles.itemCard}>
        <View style={styles.itemHeader}>
          <View style={styles.pendingBadge}>
            <Ionicons name="time-outline" size={16} color={THEME_COLORS.warning} />
            <Text style={styles.pendingBadgeText}>Pending</Text>
          </View>
          <View style={styles.actionButtons}>
            {!isProcessing && (
              <TouchableOpacity 
                onPress={() => handleDeletePendingChunk(item)} 
                style={styles.deleteButton}
                accessibilityLabel="Delete pending recording"
              >
                <Ionicons name="trash-outline" size={20} color={THEME_COLORS.error} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        <View style={styles.itemMeta}>
          <View style={styles.metaRow}>
            <Ionicons 
              name={item.type === 'polish' ? 'sparkles' : 'language'} 
              size={16} 
              color={THEME_COLORS.textMuted} 
            />
            <Text style={styles.metaText}>
              {item.type === 'polish' ? 'Polish' : 'Translate'}
            </Text>
          </View>
          <Text style={styles.metaDate}>
            {date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>

        <View style={styles.itemContent}>
          <Text style={styles.contentLabel}>
            {item.chunkCount} audio chunk{item.chunkCount > 1 ? 's' : ''} • Recorded offline
          </Text>
        </View>

        {item.metadata.language && (
          <View style={styles.itemContent}>
            <Text style={styles.contentLabel}>
              Language: {getLanguageName(item.metadata.language)}
              {item.metadata.targetLanguage && ` ? ${getLanguageName(item.metadata.targetLanguage)}`}
            </Text>
          </View>
        )}

        <Button
          title={isProcessing ? 'Processing...' : 'Process & Save'}
          onPress={() => handleProcessPendingChunk(item)}
          loading={isProcessing}
          disabled={isProcessing}
          style={styles.processButton}
          icon={<Ionicons name="cloud-upload-outline" size={20} color="white" />}
        />
      </Card>
    );
  };

  if (!isAuthenticated) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.emptyContainer}>
          <Ionicons name="bookmark-outline" size={64} color={THEME_COLORS.textMuted} />
          <Text style={styles.emptyTitle}>Sign In Required</Text>
          <Text style={styles.emptyText}>Please sign in to view your saved items</Text>
          <Button
            title="Sign In"
            onPress={() => router.push('/login')}
            style={styles.signInButton}
          />
        </View>
      </SafeAreaView>
    );
  }

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Saved Items</Text>
        <Text style={styles.count}>{savedItems.length} total</Text>
      </View>

      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'polish' && styles.tabActive]}
          onPress={() => setActiveTab('polish')}
          data-testid="tab-polish"
        >
          <Ionicons
            name="sparkles"
            size={18}
            color={activeTab === 'polish' ? THEME_COLORS.primary : THEME_COLORS.textMuted}
          />
          <Text style={[styles.tabText, activeTab === 'polish' && styles.tabTextActive]}>
            Polish
          </Text>
          <View style={[styles.badge, activeTab === 'polish' && styles.badgeActive]}>
            <Text style={[styles.badgeText, activeTab === 'polish' && styles.badgeTextActive]}>
              {polishCount}
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'translate' && styles.tabActive]}
          onPress={() => setActiveTab('translate')}
          data-testid="tab-translate"
        >
          <Ionicons
            name="language"
            size={18}
            color={activeTab === 'translate' ? THEME_COLORS.secondary : THEME_COLORS.textMuted}
          />
          <Text style={[styles.tabText, activeTab === 'translate' && styles.tabTextActive]}>
            Translate
          </Text>
          <View style={[styles.badge, activeTab === 'translate' && styles.badgeActive]}>
            <Text style={[styles.badgeText, activeTab === 'translate' && styles.badgeTextActive]}>
              {translateCount}
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'pending' && styles.tabActive]}
          onPress={() => setActiveTab('pending')}
          data-testid="tab-pending"
        >
          <Ionicons
            name="time-outline"
            size={18}
            color={activeTab === 'pending' ? THEME_COLORS.warning : THEME_COLORS.textMuted}
          />
          <Text style={[styles.tabText, activeTab === 'pending' && styles.tabTextActive]}>
            Pending
          </Text>
          {pendingCount > 0 && (
            <View style={[styles.badge, activeTab === 'pending' && styles.badgeActive, styles.badgePending]}>
              <Text style={[styles.badgeText, activeTab === 'pending' && styles.badgeTextActive]}>
                {pendingCount}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {activeTab === 'pending' ? (
        pendingChunks.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons 
              name="checkmark-done-outline" 
              size={64} 
              color={THEME_COLORS.success} 
            />
            <Text style={styles.emptyTitle}>All Caught Up!</Text>
            <Text style={styles.emptyText}>
              No pending recordings to process
            </Text>
          </View>
        ) : (
          <FlatList
            data={pendingChunks}
            renderItem={renderPendingItem}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={THEME_COLORS.primary}
              />
            }
          />
        )
      ) : (
        filteredItems.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons 
              name={activeTab === 'polish' ? 'sparkles-outline' : 'language-outline'} 
              size={64} 
              color={THEME_COLORS.textMuted} 
            />
            <Text style={styles.emptyTitle}>No {activeTab === 'polish' ? 'Polished' : 'Translated'} Items</Text>
            <Text style={styles.emptyText}>
              Your {activeTab === 'polish' ? 'polished' : 'translated'} texts will appear here
            </Text>
          </View>
        ) : (
          <FlatList
            data={filteredItems}
            renderItem={renderItem}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={THEME_COLORS.primary}
              />
            }
          />
        )
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME_COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    paddingBottom: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: THEME_COLORS.text,
  },
  count: {
    fontSize: 14,
    color: THEME_COLORS.textSecondary,
  },
  tabContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 12,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: THEME_COLORS.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: THEME_COLORS.border,
  },
  tabActive: {
    borderColor: THEME_COLORS.primary,
    backgroundColor: THEME_COLORS.primaryMuted,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: THEME_COLORS.textMuted,
  },
  tabTextActive: {
    color: THEME_COLORS.text,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: THEME_COLORS.border,
  },
  badgeActive: {
    backgroundColor: THEME_COLORS.primary,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: THEME_COLORS.textMuted,
  },
  badgeTextActive: {
    color: '#ffffff',
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
    justifyContent: 'flex-end',
    marginBottom: 8,
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  editButton: {
    padding: 4,
  },
  deleteButton: {
    padding: 4,
  },
  itemMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
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
  contentLabelHighlight: {
    fontSize: 12,
    color: THEME_COLORS.primary,
    fontWeight: '500',
    marginBottom: 4,
  },
  contentText: {
    fontSize: 14,
    color: THEME_COLORS.textSecondary,
    lineHeight: 20,
  },
  contentTextHighlight: {
    fontSize: 14,
    color: THEME_COLORS.text,
    lineHeight: 20,
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
  signInButton: {
    marginTop: 24,
    minWidth: 150,
  },
  badgePending: {
    backgroundColor: THEME_COLORS.warning,
  },
  pendingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: THEME_COLORS.warning + '20',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 'auto',
  },
  pendingBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: THEME_COLORS.warning,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  processButton: {
    marginTop: 12,
  },
});
