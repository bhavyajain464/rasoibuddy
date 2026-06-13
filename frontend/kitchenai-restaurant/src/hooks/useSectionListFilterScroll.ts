import { useCallback, useLayoutEffect, useRef } from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  SectionList,
} from 'react-native';

function startWebScrollPin(pin: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const prevRestoration = window.history.scrollRestoration;
  window.history.scrollRestoration = 'manual';
  let cancelled = false;
  const run = () => {
    if (cancelled) return;
    pin();
    window.scrollTo(0, 0);
  };
  run();
  const timers = [0, 16, 50, 120, 250, 400, 600, 800].map((ms) => window.setTimeout(run, ms));
  const interval = window.setInterval(run, 40);
  const stopInterval = window.setTimeout(() => window.clearInterval(interval), 900);
  return () => {
    cancelled = true;
    timers.forEach((id) => window.clearTimeout(id));
    window.clearInterval(interval);
    window.clearTimeout(stopInterval);
    window.history.scrollRestoration = prevRestoration;
  };
}

/** Pin list to top and block onEndReached until the user scrolls (avoids pill-switch jump to bottom). */
export function useSectionListFilterScroll<T>(
  filterKey: string,
  loading: boolean,
) {
  const listRef = useRef<SectionList<T>>(null);
  const userHasScrolledRef = useRef(false);
  const loadMoreLockRef = useRef(false);
  const pendingPinRef = useRef(false);
  const endReachedBlockedUntilRef = useRef(0);
  const scrollIgnoreUntilRef = useRef(0);
  const skipFilterPinRef = useRef(true);
  const webPinCleanupRef = useRef<(() => void) | null>(null);

  const clearWebPin = useCallback(() => {
    webPinCleanupRef.current?.();
    webPinCleanupRef.current = null;
  }, []);

  const pinListToTop = useCallback(() => {
    const run = () => {
      if (Platform.OS === 'web') {
        const node = listRef.current?.getScrollableNode?.() as HTMLElement | undefined;
        if (node) node.scrollTop = 0;
        window.scrollTo(0, 0);
        return;
      }
      try {
        listRef.current?.scrollToLocation({
          sectionIndex: 0,
          itemIndex: 0,
          animated: false,
          viewOffset: 0,
        });
      } catch {
        // SectionList throws when there are no rendered items yet.
      }
    };
    run();
    requestAnimationFrame(run);
  }, []);

  const armScrollPin = useCallback(() => {
    pendingPinRef.current = true;
    pinListToTop();
    if (Platform.OS === 'web') {
      clearWebPin();
      webPinCleanupRef.current = startWebScrollPin(pinListToTop);
    } else {
      setTimeout(pinListToTop, 0);
      setTimeout(pinListToTop, 50);
      setTimeout(pinListToTop, 150);
    }
  }, [clearWebPin, pinListToTop]);

  const resetForFilterChange = useCallback(() => {
    userHasScrolledRef.current = false;
    loadMoreLockRef.current = false;
    const blockMs = Date.now() + 1500;
    endReachedBlockedUntilRef.current = blockMs;
    scrollIgnoreUntilRef.current = blockMs;
    armScrollPin();
  }, [armScrollPin]);

  const handleListScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (Date.now() < scrollIgnoreUntilRef.current) return;
    if (event.nativeEvent.contentOffset.y > 24) {
      userHasScrolledRef.current = true;
    }
  }, []);

  const handleContentSizeChange = useCallback(() => {
    if (!pendingPinRef.current) return;
    pendingPinRef.current = false;
    pinListToTop();
  }, [pinListToTop]);

  useLayoutEffect(() => {
    if (skipFilterPinRef.current) {
      skipFilterPinRef.current = false;
      return;
    }
    armScrollPin();
  }, [filterKey, armScrollPin]);

  useLayoutEffect(() => {
    if (loading) return;
    armScrollPin();
    return clearWebPin;
  }, [filterKey, loading, armScrollPin, clearWebPin]);

  const canAutoLoadMore = useCallback(() => {
    if (Date.now() < endReachedBlockedUntilRef.current) return false;
    return userHasScrolledRef.current;
  }, []);

  return {
    listRef,
    loadMoreLockRef,
    handleListScroll,
    handleContentSizeChange,
    resetForFilterChange,
    canAutoLoadMore,
  };
}
