import { useCallback, useRef, type RefObject } from 'react';
import { Platform, type FlatList } from 'react-native';

const END_REACHED_THRESHOLD = 0.35;

export function getListScrollElement<T>(listRef: RefObject<FlatList<T> | null>): HTMLElement | null {
  const node = listRef.current as unknown as {
    getScrollableNode?: () => HTMLElement | null;
  } | null;
  return node?.getScrollableNode?.() ?? null;
}

/** Scroll a FlatList to the top (Instagram always opens at the top of the feed). */
export function scrollFlatListToTop<T>(listRef: RefObject<FlatList<T> | null>) {
  listRef.current?.scrollToOffset({ offset: 0, animated: false });
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const el = getListScrollElement(listRef);
    if (el) el.scrollTop = 0;
  }
}

type Options<T = unknown> = {
  onLoadMore: () => void | Promise<void>;
  hasMore: boolean;
  loading?: boolean;
  loadingMore?: boolean;
};

/**
 * Instagram-style FlatList pagination: load the next page only when the user
 * scrolls near the bottom. Uses the standard momentum guard so onEndReached
 * does not fire on mount or after programmatic scroll-to-top.
 */
export function useFlatListOnEndReached<T = unknown>({
  onLoadMore,
  hasMore,
  loading = false,
  loadingMore = false,
}: Options<T>) {
  const onLoadMoreRef = useRef(onLoadMore);
  onLoadMoreRef.current = onLoadMore;
  const hasMoreRef = useRef(hasMore);
  hasMoreRef.current = hasMore;
  const loadingRef = useRef(loading);
  loadingRef.current = loading;
  const loadingMoreRef = useRef(loadingMore);
  loadingMoreRef.current = loadingMore;

  const blockedDuringMomentumRef = useRef(true);
  const fetchingRef = useRef(false);

  const resetEndReached = useCallback(() => {
    blockedDuringMomentumRef.current = true;
    fetchingRef.current = false;
  }, []);

  const handleEndReached = useCallback(() => {
    if (blockedDuringMomentumRef.current) return;
    if (!hasMoreRef.current || loadingRef.current || loadingMoreRef.current || fetchingRef.current) {
      return;
    }

    blockedDuringMomentumRef.current = true;
    fetchingRef.current = true;
    void Promise.resolve(onLoadMoreRef.current()).finally(() => {
      fetchingRef.current = false;
    });
  }, []);

  const flatListProps = {
    onEndReachedThreshold: END_REACHED_THRESHOLD,
    onEndReached: handleEndReached,
    onMomentumScrollBegin: () => {
      blockedDuringMomentumRef.current = false;
    },
    onScrollBeginDrag: () => {
      blockedDuringMomentumRef.current = false;
    },
  };

  return { flatListProps, resetEndReached };
}
