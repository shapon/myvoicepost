import { useState, useCallback, useMemo, memo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import { savedItemsApi, SavedItem } from '../lib/api';
import { Card } from '../components/ui/Card';
import { LANGUAGES, THEME_COLORS } from '../lib/constants';
import { useAuth } from '../contexts/AuthContext';
import { useEditingSavedItem } from '../contexts/EditingSavedItemContext';

const languageMap = new Map(LANGUAGES.map(l => [l.code, `${l.flag} ${l.name}`]));
const getLanguageName = (code: string) => languageMap.get(code) || code;

const SavedItemCard = memo(function SavedItemCard({ item, onEdit, onDelete }: { item: SavedItem; onEdit: (item: SavedItem) => void; onDelete: (id: string) => void }) {
  return (
    <Card style={styles.itemCard}>
      <View style={styles.itemHeader}>
        <View style={styles.itemType}>
          <Ionicons
            name={item.type === 'polish' ? 'sparkles' : 'language'}
            size={18}
            color={item.type === 'polish' ? THEME_COLORS.primary : THEME_COLORS.secondary}
          />
          <Text style={styles.itemTypeText}>
            {item.type === 'polish' ? 'Polish' : 'Translate'}
          </Text>
        </View>
        <View style={styles.itemActions}>
          <TouchableOpacity onPress={() => onEdit(item)} style={styles.editButton}>
            <Ionicons name="create-outline" size={20} color={THEME_COLORS.primary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onDelete(item.id)} style={styles.deleteButton}>
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
          {item.polishedText}
        </Text>
      </View>
    </Card>
  );
});

export function SavedItemsScreen() {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const navigation = useNavigation();
  const { setEditingItem } = useEditingSavedItem();
  const [refreshing, setRefreshing] = useState(false);

  const { data: savedItems = [], isLoading, refetch } = useQuery({
    queryKey: ['savedItems'],
    queryFn: () => savedItemsApi.getAll(),  // No type = get all items
    enabled: isAuthenticated,
  });

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
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const keyExtractor = useCallback((item: SavedItem) => item.id, []);

  const handleDelete = useCallback((id: string) => {
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
  }, [deleteMutation]);

  const handleEdit = useCallback((item: SavedItem) => {
    setEditingItem(item);
    navigation.navigate(item.type === 'polish' ? 'Polish' : 'Translate');
  }, [setEditingItem, navigation]);

  const renderItem = useCallback(({ item }: { item: SavedItem }) => (
    <SavedItemCard item={item} onEdit={handleEdit} onDelete={handleDelete} />
  ), [handleEdit, handleDelete]);

  if (!isAuthenticated) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="bookmark-outline" size={64} color={THEME_COLORS.textMuted} />
        <Text style={styles.emptyTitle}>Sign In Required</Text>
        <Text style={styles.emptyText}>Please sign in to view your saved items</Text>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Saved Items</Text>
        <Text style={styles.count}>{savedItems.length} items</Text>
      </View>

      {savedItems.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="bookmark-outline" size={64} color={THEME_COLORS.textMuted} />
          <Text style={styles.emptyTitle}>No Saved Items</Text>
          <Text style={styles.emptyText}>
            Your polished and translated texts will appear here
          </Text>
        </View>
      ) : (
        <FlatList
          data={savedItems}
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: THEME_COLORS.border,
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
});
