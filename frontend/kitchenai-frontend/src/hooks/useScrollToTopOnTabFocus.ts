import { useCallback, useRef } from 'react';
import { Platform, type ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useProductTour } from '../context/ProductTourContext';

export function scrollViewToTop(
  scrollRef: React.RefObject<ScrollView | null>,
  animated = false,
) {
  scrollRef.current?.scrollTo({ y: 0, animated });
  if (Platform.OS === 'web') {
    const node = scrollRef.current as unknown as {
      getScrollableNode?: () => HTMLElement | null;
    } | null;
    const el = node?.getScrollableNode?.();
    if (el) {
      el.scrollTop = 0;
    }
    window.scrollTo(0, 0);
  }
}

type UseScrollToTopOnTabFocusOptions = {
  animated?: boolean;
  /** Stronger reset for screens with web scroll restoration (e.g. Inventory). */
  onScrollToTop?: () => void;
};

export function useScrollToTopOnTabFocus(
  scrollRef: React.RefObject<ScrollView | null>,
  options?: UseScrollToTopOnTabFocusOptions,
) {
  const { isTourActive } = useProductTour();
  const skipFirstFocusRef = useRef(true);
  const animated = options?.animated ?? false;
  const onScrollToTop = options?.onScrollToTop;

  const scrollToTop = useCallback(() => {
    if (onScrollToTop) {
      onScrollToTop();
      return;
    }
    scrollViewToTop(scrollRef, animated);
    if (Platform.OS === 'web') {
      requestAnimationFrame(() => scrollViewToTop(scrollRef, animated));
    }
  }, [animated, onScrollToTop, scrollRef]);

  useFocusEffect(
    useCallback(() => {
      if (skipFirstFocusRef.current) {
        skipFirstFocusRef.current = false;
        return;
      }
      if (isTourActive) return;
      scrollToTop();
    }, [isTourActive, scrollToTop]),
  );

  return { scrollToTop };
}
