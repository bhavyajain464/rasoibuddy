import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { ActivityIndicator, IconButton, Text, TextInput } from 'react-native-paper';
import { DishImage } from './DishImage';
import { DishRecipeSheet } from './DishRecipeSheet';
import { DISH_RECIPE_PAGE_SIZE, fetchDishRecipePage } from '../services/api';
import type { DishRecipeSummary } from '../types';
import { palette } from '../theme';
import { scrollFlatListToTop, useFlatListOnEndReached } from '../utils/infiniteScroll';

type Props = {
  intentToken?: number;
  initialSearch?: string;
  expandDishId?: string;
  contentPaddingBottom?: number;
  /** Called once after a navigation-driven search/expand is applied. */
  onIntentConsumed?: () => void;
};

const THUMB_SIZE = 72;

function formatTime(summary: DishRecipeSummary) {
  const mins = summary.total_time_minutes ?? summary.cook_time_minutes ?? summary.prep_time_minutes;
  if (mins == null || mins <= 0) return null;
  return `${mins} min`;
}

function metaLine(item: DishRecipeSummary) {
  return [
    formatTime(item),
    item.ingredient_count > 0 ? `${item.ingredient_count} ingredients` : null,
    item.step_count > 0 ? `${item.step_count} steps` : null,
  ].filter(Boolean).join(' · ');
}

function RecipeRow({
  item,
  onPress,
}: {
  item: DishRecipeSummary;
  onPress: () => void;
}) {
  const subtitle = metaLine(item);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <DishImage
        dishId={item.dish_id}
        dishName={item.dish_name || item.title}
        variant="thumb"
        width={THUMB_SIZE}
        borderRadius={10}
        style={styles.thumb}
        accessibilityLabel={`Photo of ${item.dish_name || item.title}`}
      />
      <View style={styles.rowBody}>
        <Text variant="titleSmall" style={styles.rowTitle} numberOfLines={2}>
          {item.dish_name || item.title}
        </Text>
        {subtitle ? (
          <Text variant="bodySmall" style={styles.rowMeta} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <IconButton
        icon="chevron-right"
        size={20}
        iconColor="#9E9E9E"
        style={styles.chevron}
      />
    </Pressable>
  );
}

export function CookingRecipesPanel({
  intentToken = 0,
  initialSearch = '',
  expandDishId = '',
  contentPaddingBottom = 24,
  onIntentConsumed,
}: Props) {
  const appliedIntentToken = useRef(0);
  const requestGen = useRef(0);
  const nextOffsetRef = useRef(0);
  const resetEndReachedRef = useRef<() => void>(() => {});
  const listRef = useRef<FlatList<DishRecipeSummary>>(null);
  const loadPageRef = useRef<(offset: number, append: boolean) => Promise<void>>(async () => {});

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [pendingExpandId, setPendingExpandId] = useState('');
  const [summaries, setSummaries] = useState<DishRecipeSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [selectedDish, setSelectedDish] = useState<DishRecipeSummary | null>(null);

  useEffect(() => {
    if (!intentToken || intentToken <= appliedIntentToken.current) return;
    appliedIntentToken.current = intentToken;

    const q = initialSearch.trim();
    const id = expandDishId.trim();
    if (q) {
      setSearch(q);
      setDebouncedSearch(q);
    }
    if (id) setPendingExpandId(id);
    onIntentConsumed?.();
  }, [intentToken, initialSearch, expandDishId, onIntentConsumed]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const loadPage = useCallback(async (offset: number, append: boolean) => {
    const gen = ++requestGen.current;
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
      setLoadError('');
      nextOffsetRef.current = 0;
      resetEndReachedRef.current();
    }
    try {
      const page = await fetchDishRecipePage({
        q: debouncedSearch,
        offset,
        limit: DISH_RECIPE_PAGE_SIZE,
      });
      if (gen !== requestGen.current) return;
      setSummaries((prev) => (append ? [...prev, ...page.items] : page.items));
      nextOffsetRef.current = offset + page.items.length;
      setTotal(page.total);
      setHasMore(page.has_more);
    } catch (err) {
      if (gen !== requestGen.current) return;
      if (!append) {
        setSummaries([]);
        setTotal(0);
        setHasMore(false);
      }
      const msg = err instanceof Error ? err.message : 'Could not load recipes';
      setLoadError(msg.includes('404')
        ? 'Recipes API not available — restart local backend or deploy latest backend to staging.'
        : msg);
    } finally {
      if (gen === requestGen.current) {
        setLoading(false);
        setLoadingMore(false);
        if (!append) {
          requestAnimationFrame(() => scrollFlatListToTop(listRef));
        }
      }
    }
  }, [debouncedSearch]);

  useEffect(() => {
    void loadPage(0, false);
  }, [loadPage]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    await loadPage(nextOffsetRef.current, true);
  }, [loadingMore, hasMore, loadPage]);

  const { flatListProps, resetEndReached } = useFlatListOnEndReached({
    onLoadMore: loadMore,
    hasMore,
    loading,
    loadingMore,
  });
  resetEndReachedRef.current = resetEndReached;

  useEffect(() => {
    const id = pendingExpandId.trim();
    if (!id || loading) return;
    const match = summaries.find((s) => s.dish_id === id);
    if (match) {
      setSelectedDish(match);
      setPendingExpandId('');
      return;
    }
    if (search.trim() && !hasMore) {
      setSelectedDish({
        dish_id: id,
        dish_name: search.trim(),
        title: search.trim(),
        ingredient_count: 0,
        step_count: 0,
      });
      setPendingExpandId('');
    }
  }, [pendingExpandId, summaries, loading, search, hasMore]);

  const emptyLabel = useMemo(() => {
    if (debouncedSearch) return `No recipes match "${debouncedSearch}".`;
    return 'No recipes imported yet.';
  }, [debouncedSearch]);

  const listHeader = total > 0 ? (
    <Text variant="labelMedium" style={styles.countLabel}>
      {total} recipe{total === 1 ? '' : 's'}
    </Text>
  ) : null;

  const listFooter = loadingMore ? (
    <ActivityIndicator color={palette.primary} style={styles.footerLoader} />
  ) : null;

  return (
    <View style={styles.wrap}>
      <TextInput
        mode="outlined"
        placeholder="Search dishes with recipes"
        value={search}
        onChangeText={setSearch}
        left={<TextInput.Icon icon="magnify" />}
        style={styles.search}
        outlineColor="#E0E0E0"
        activeOutlineColor={palette.primary}
        outlineStyle={{ borderRadius: 12 }}
        dense
      />

      {loading ? (
        <ActivityIndicator color={palette.primary} style={styles.loader} />
      ) : loadError ? (
        <Text variant="bodyMedium" style={styles.error}>{loadError}</Text>
      ) : summaries.length === 0 ? (
        <Text variant="bodyMedium" style={styles.empty}>{emptyLabel}</Text>
      ) : (
        <FlatList
          ref={listRef}
          data={summaries}
          keyExtractor={(item) => item.dish_id}
          style={styles.list}
          contentContainerStyle={{ paddingBottom: contentPaddingBottom }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          {...flatListProps}
          ListHeaderComponent={listHeader}
          ListFooterComponent={listFooter}
          renderItem={({ item }) => (
            <RecipeRow item={item} onPress={() => setSelectedDish(item)} />
          )}
        />
      )}

      <DishRecipeSheet
        visible={selectedDish != null}
        dishId={selectedDish?.dish_id}
        dishName={selectedDish?.dish_name || selectedDish?.title}
        onDismiss={() => setSelectedDish(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, paddingHorizontal: 16, paddingTop: 4 },
  search: { marginBottom: 10, backgroundColor: '#fff' },
  loader: { marginTop: 32 },
  footerLoader: { marginVertical: 16 },
  error: { color: '#C62828', textAlign: 'center', marginTop: 24, lineHeight: 22 },
  empty: { color: palette.textSecondary, textAlign: 'center', marginTop: 24 },
  countLabel: { color: '#888', marginBottom: 8 },
  list: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E8F5E9',
    padding: 10,
    marginBottom: 10,
  },
  rowPressed: { opacity: 0.92 },
  thumb: { flexShrink: 0 },
  rowBody: { flex: 1, minWidth: 0, justifyContent: 'center', gap: 2 },
  rowTitle: { fontWeight: '700', color: '#1A1A1A', lineHeight: 20 },
  rowMeta: { color: '#888' },
  chevron: { margin: 0, width: 28, height: 28 },
});
