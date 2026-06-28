import { useCallback, useLayoutEffect, useRef } from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  ScrollView,
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

/** Scroll pin + load-more guard for ingredient grid screens (ScrollView). */
export function useGridFilterScroll(filterKey: string, loading: boolean) {
  const scrollRef = useRef<ScrollView>(null);
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

  const pinScrollToTop = useCallback(() => {
    const run = () => {
      if (Platform.OS === 'web') {
        const node = scrollRef.current?.getScrollableNode?.() as HTMLElement | undefined;
        if (node) node.scrollTop = 0;
        window.scrollTo(0, 0);
        return;
      }
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    };
    run();
    requestAnimationFrame(run);
  }, []);

  const armScrollPin = useCallback(() => {
    pendingPinRef.current = true;
    pinScrollToTop();
    if (Platform.OS === 'web') {
      clearWebPin();
      webPinCleanupRef.current = startWebScrollPin(pinScrollToTop);
    } else {
      setTimeout(pinScrollToTop, 0);
      setTimeout(pinScrollToTop, 50);
      setTimeout(pinScrollToTop, 150);
    }
  }, [clearWebPin, pinScrollToTop]);

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
    pinScrollToTop();
  }, [pinScrollToTop]);

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
    scrollRef,
    loadMoreLockRef,
    handleListScroll,
    handleContentSizeChange,
    resetForFilterChange,
    canAutoLoadMore,
  };
}
