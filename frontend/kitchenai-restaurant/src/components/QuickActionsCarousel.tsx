import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { Icon, IconButton, Surface, Text } from 'react-native-paper';
import { palette } from '../theme';

const H_PAD = 20;
const GAP = 10;
const ACTION_CARD_HEIGHT = 92;
const MIN_CARD_WIDTH = ACTION_CARD_HEIGHT;
const ACTION_COUNT = 2;
const ARROW_SIZE = 34;
const ARROW_GUTTER = ARROW_SIZE + 12;

type QuickActionsCarouselProps = {
  onAddDish: () => void;
  onAddToBuyList: () => void;
};

function ActionSlide({
  icon,
  label,
  onPress,
  width,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  width: number;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [{ width, height: ACTION_CARD_HEIGHT, opacity: pressed ? 0.88 : 1 }]}
    >
      <Surface style={[styles.actionSurface, { width, height: ACTION_CARD_HEIGHT }]} elevation={0}>
        <View style={styles.actionIconWrap}>
          <IconButton icon={icon} iconColor={palette.primary} size={22} style={{ margin: 0 }} />
        </View>
        <Text variant="labelMedium" style={styles.actionLabel} numberOfLines={2}>
          {label}
        </Text>
      </Surface>
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
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.arrowHit,
        direction === 'left' ? styles.arrowHitLeft : styles.arrowHitRight,
        pressed && styles.arrowHitPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={direction === 'left' ? 'Scroll quick actions left' : 'Scroll quick actions right'}
    >
      <View style={styles.arrowCircle}>
        <Icon source={icon} size={22} color={palette.text} />
      </View>
    </Pressable>
  );
}

function useQuickActionLayout(screenWidth: number) {
  return useMemo(() => {
    const frameWidth = screenWidth - H_PAD * 2;
    const ideal = (frameWidth - (ACTION_COUNT - 1) * GAP) / ACTION_COUNT;
    const cardWidth = Math.max(MIN_CARD_WIDTH, Math.floor(ideal));
    const rowWidth = ACTION_COUNT * cardWidth + (ACTION_COUNT - 1) * GAP;
    const scrollable = rowWidth > frameWidth + 1;
    const snapInterval = cardWidth + GAP;
    return { cardWidth, scrollable, snapInterval, frameWidth };
  }, [screenWidth]);
}

export function QuickActionsCarousel({ onAddDish, onAddToBuyList }: QuickActionsCarouselProps) {
  const { width: screenWidth } = useWindowDimensions();
  const { cardWidth, scrollable, snapInterval, frameWidth } = useQuickActionLayout(screenWidth);
  const scrollRef = useRef<ScrollView>(null);
  const scrollXRef = useRef(0);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(scrollable);

  useEffect(() => {
    if (!scrollable) {
      setShowLeftArrow(false);
      setShowRightArrow(false);
      return;
    }
    setShowRightArrow(true);
    setShowLeftArrow(false);
  }, [scrollable]);

  const updateArrowVisibility = useCallback(
    (x: number, content: number) => {
      if (!scrollable) {
        setShowLeftArrow(false);
        setShowRightArrow(false);
        return;
      }
      if (content <= 0) {
        setShowLeftArrow(false);
        setShowRightArrow(true);
        return;
      }
      setShowLeftArrow(x > 4);
      setShowRightArrow(x < content - frameWidth - 4);
    },
    [scrollable, frameWidth],
  );

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = e.nativeEvent.contentOffset.x;
      scrollXRef.current = x;
      updateArrowVisibility(x, e.nativeEvent.contentSize.width);
    },
    [updateArrowVisibility],
  );

  const scrollNext = useCallback(() => {
    scrollRef.current?.scrollTo({ x: scrollXRef.current + snapInterval, animated: true });
  }, [snapInterval]);

  const scrollPrev = useCallback(() => {
    scrollRef.current?.scrollTo({ x: Math.max(0, scrollXRef.current - snapInterval), animated: true });
  }, [snapInterval]);

  const slides = (
    <>
      <ActionSlide icon="food" label="Add dish" onPress={onAddDish} width={cardWidth} />
      <ActionSlide icon="cart-plus" label="Add to buy list" onPress={onAddToBuyList} width={cardWidth} />
    </>
  );

  if (scrollable) {
    return (
      <View style={styles.wrap}>
        <View style={[styles.carouselFrame, { width: frameWidth, height: ACTION_CARD_HEIGHT }]}>
          <ScrollView
            ref={scrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            decelerationRate="fast"
            snapToInterval={snapInterval}
            snapToAlignment="start"
            nestedScrollEnabled
            scrollEventThrottle={16}
            onScroll={onScroll}
            onContentSizeChange={(w) => updateArrowVisibility(scrollXRef.current, w)}
            style={{ width: frameWidth, height: ACTION_CARD_HEIGHT }}
            contentContainerStyle={styles.scrollContent}
          >
            {slides}
          </ScrollView>
          <View style={styles.arrowOverlayLeft} pointerEvents="box-none">
            <CarouselScrollArrow direction="left" onPress={scrollPrev} visible={showLeftArrow} />
          </View>
          <View style={styles.arrowOverlayRight} pointerEvents="box-none">
            <CarouselScrollArrow direction="right" onPress={scrollNext} visible={showRightArrow} />
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={[styles.row, { width: frameWidth, height: ACTION_CARD_HEIGHT }]}>{slides}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 8, marginHorizontal: H_PAD },
  carouselFrame: { position: 'relative' },
  scrollContent: {
    flexDirection: 'row',
    gap: GAP,
    alignItems: 'center',
    paddingRight: GAP,
  },
  row: {
    flexDirection: 'row',
    gap: GAP,
    alignItems: 'center',
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
  arrowHit: { alignItems: 'center', justifyContent: 'center' },
  arrowHitLeft: { marginLeft: -ARROW_SIZE / 2 },
  arrowHitRight: { marginRight: -ARROW_SIZE / 2 },
  arrowHitPressed: { opacity: 0.85 },
  arrowCircle: {
    width: ARROW_SIZE,
    height: ARROW_SIZE,
    borderRadius: ARROW_SIZE / 2,
    backgroundColor: palette.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: palette.border,
  },
  actionSurface: {
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.surfaceElevated,
    borderWidth: 1,
    borderColor: palette.border,
    overflow: 'hidden',
  },
  actionIconWrap: { marginBottom: 2 },
  actionLabel: {
    fontWeight: '600',
    fontSize: 10,
    lineHeight: 13,
    color: palette.text,
    textAlign: 'center',
  },
});
