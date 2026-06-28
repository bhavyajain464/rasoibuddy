import React, { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type ViewStyle,
} from 'react-native';
import { Icon, Text } from 'react-native-paper';
import { palette } from '../theme';

const H_PAD = 16;
const GAP = 8;
const ROW_HEIGHT = 44;
const ARROW_SIZE = 24;
const ARROW_GUTTER = ARROW_SIZE + 8;
const SCROLL_STEP_RATIO = 0.72;

type FilterPillProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
  style?: ViewStyle;
};

export function FilterPill({ label, selected, onPress, disabled = false, style }: FilterPillProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      style={({ pressed }) => [
        styles.pill,
        selected ? styles.pillSelected : styles.pillInactive,
        pressed && !disabled && styles.pillPressed,
        disabled && styles.pillDisabled,
        style,
      ]}
    >
      <Text style={[styles.label, selected ? styles.labelSelected : styles.labelInactive]}>
        {label}
      </Text>
    </Pressable>
  );
}

function CarouselScrollArrow({
  direction,
  onPress,
  visible,
}: {
  direction: 'left' | 'right';
  onPress: () => void;
  visible: boolean;
}) {
  if (!visible) return null;

  const icon = direction === 'left' ? 'chevron-left' : 'chevron-right';
  const label = direction === 'left' ? 'Scroll filters left' : 'Scroll filters right';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.arrowHit,
        direction === 'left' ? styles.arrowHitLeft : styles.arrowHitRight,
        pressed && styles.arrowHitPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={styles.arrowCircle}>
        <Icon source={icon} size={18} color={palette.text} />
      </View>
    </Pressable>
  );
}

type FilterPillRowProps = {
  children: ReactNode;
  style?: ViewStyle;
  inset?: number;
};

/** Horizontal filter carousel with edge arrows (matches consumer KitchenAI). */
export function FilterPillRow({ children, style, inset = H_PAD }: FilterPillRowProps) {
  const { width: screenWidth } = useWindowDimensions();
  const frameWidth = screenWidth - inset * 2;
  const scrollRef = useRef<ScrollView>(null);
  const scrollXRef = useRef(0);
  const [scrollable, setScrollable] = useState(false);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(false);
  const scrollStep = Math.max(120, Math.floor(frameWidth * SCROLL_STEP_RATIO));

  const updateArrowVisibility = useCallback(
    (x: number, contentWidth: number) => {
      if (contentWidth <= frameWidth + 1) {
        setShowLeftArrow(false);
        setShowRightArrow(false);
        return;
      }
      setShowLeftArrow(x > 4);
      setShowRightArrow(x < contentWidth - frameWidth - 4);
    },
    [frameWidth],
  );

  const applyContentWidth = useCallback(
    (contentWidth: number) => {
      if (contentWidth <= 0) return;
      const needsScroll = contentWidth > frameWidth + 1;
      setScrollable(needsScroll);
      if (!needsScroll) {
        setShowLeftArrow(false);
        setShowRightArrow(false);
        if (scrollXRef.current > 4) {
          scrollXRef.current = 0;
          scrollRef.current?.scrollTo({ x: 0, animated: false });
        }
        return;
      }
      updateArrowVisibility(scrollXRef.current, contentWidth);
    },
    [frameWidth, updateArrowVisibility],
  );

  useEffect(() => {
    if (!scrollable) {
      setShowLeftArrow(false);
      setShowRightArrow(false);
      return;
    }
    setShowRightArrow(true);
    setShowLeftArrow(false);
  }, [scrollable]);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize } = e.nativeEvent;
      scrollXRef.current = contentOffset.x;
      updateArrowVisibility(contentOffset.x, contentSize.width);
    },
    [updateArrowVisibility],
  );

  const scrollNext = useCallback(() => {
    scrollRef.current?.scrollTo({ x: scrollXRef.current + scrollStep, animated: true });
  }, [scrollStep]);

  const scrollPrev = useCallback(() => {
    scrollRef.current?.scrollTo({ x: Math.max(0, scrollXRef.current - scrollStep), animated: true });
  }, [scrollStep]);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ x: scrollXRef.current, animated: false });
    });
    return () => cancelAnimationFrame(id);
  }, [frameWidth, children]);

  const pillsRow = React.Children.map(children, (child) => {
    if (!child) return null;
    if (!React.isValidElement(child)) return child;
    return <View style={styles.pillSlot}>{child}</View>;
  });

  const scrollContentStyle = scrollable
    ? [styles.scrollContent, styles.scrollContentWithGutters]
    : styles.scrollContent;

  return (
    <View style={[styles.wrap, { marginHorizontal: inset }, style]}>
      <View style={[styles.carouselFrame, { width: frameWidth, height: ROW_HEIGHT }]}>
        <ScrollView
          ref={scrollRef}
          horizontal
          scrollEnabled
          nestedScrollEnabled
          directionalLockEnabled={Platform.OS !== 'web'}
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          keyboardShouldPersistTaps="handled"
          onScroll={onScroll}
          onContentSizeChange={applyContentWidth}
          style={[styles.carouselScroll, { width: frameWidth, height: ROW_HEIGHT }]}
          contentContainerStyle={scrollContentStyle}
        >
          <View style={styles.pillsRow}>{pillsRow}</View>
        </ScrollView>
        {scrollable ? (
          <>
            <View style={styles.arrowOverlayLeft} pointerEvents="box-none">
              <CarouselScrollArrow direction="left" onPress={scrollPrev} visible={showLeftArrow} />
            </View>
            <View style={styles.arrowOverlayRight} pointerEvents="box-none">
              <CarouselScrollArrow direction="right" onPress={scrollNext} visible={showRightArrow} />
            </View>
          </>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 10,
    zIndex: 2,
    overflow: 'visible',
  },
  carouselFrame: {
    position: 'relative',
    overflow: 'visible',
  },
  carouselScroll: Platform.OS === 'web' ? { overflow: 'visible' as const } : {},
  scrollContent: {
    flexGrow: 0,
    paddingVertical: 2,
    minHeight: ROW_HEIGHT,
  },
  scrollContentWithGutters: {
    paddingHorizontal: 2,
  },
  pillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: GAP,
    flexGrow: 0,
    flexShrink: 0,
    ...(Platform.OS === 'web'
      ? ({ width: 'max-content', maxWidth: 'none' } as unknown as ViewStyle)
      : null),
  },
  pillSlot: {
    flexShrink: 0,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  pillInactive: {
    backgroundColor: palette.surfaceElevated,
    borderColor: palette.border,
  },
  pillSelected: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderColor: palette.primary,
  },
  pillPressed: {
    opacity: 0.88,
  },
  pillDisabled: {
    opacity: 0.45,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  labelInactive: {
    color: palette.textMuted,
  },
  labelSelected: {
    color: palette.primary,
  },
  arrowOverlayLeft: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: ARROW_GUTTER,
    justifyContent: 'center',
    alignItems: 'flex-start',
    zIndex: 2,
  },
  arrowOverlayRight: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: ARROW_GUTTER,
    justifyContent: 'center',
    alignItems: 'flex-end',
    zIndex: 2,
  },
  arrowHit: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowHitLeft: {
    marginLeft: -ARROW_SIZE / 2,
  },
  arrowHitRight: {
    marginRight: -ARROW_SIZE / 2,
  },
  arrowHitPressed: {
    opacity: 0.85,
  },
  arrowCircle: {
    width: ARROW_SIZE,
    height: ARROW_SIZE,
    borderRadius: ARROW_SIZE / 2,
    backgroundColor: palette.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: palette.border,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.2,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
      },
      android: { elevation: 4 },
      default: {},
    }),
  },
});
