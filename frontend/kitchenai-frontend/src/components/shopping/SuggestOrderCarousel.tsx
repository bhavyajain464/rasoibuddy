import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { ActivityIndicator, Icon, Surface, Text } from 'react-native-paper';
import { OrderSuggestItem } from '../../types';
import { DEFAULT_UNIT } from '../UnitPillSelector';
import { IngredientThumb } from '../IngredientThumb';

const SUGGEST_CARD_MARGIN = 16;
const SUGGEST_CARD_PAD = 10;
const SUGGEST_BLOCK_GAP = 5;
const SUGGEST_VISIBLE_COLUMNS = 3;
const SUGGEST_BLOCK_HEIGHT = 88;
const ARROW_SIZE = 26;
const ARROW_GUTTER = ARROW_SIZE + 4;
const THUMB_SIZE = 34;

type Props = {
  suggestions: OrderSuggestItem[];
  addingKey: string | null;
  onAdd: (suggestion: OrderSuggestItem) => void;
};

function SuggestOrderBlock({
  suggestion,
  width,
  adding,
  onAdd,
}: {
  suggestion: OrderSuggestItem;
  width: number;
  adding: boolean;
  onAdd: (s: OrderSuggestItem) => void;
}) {
  const qtyLabel =
    suggestion.qty > 0
      ? `${suggestion.qty} ${suggestion.unit || DEFAULT_UNIT}`
      : suggestion.unit || DEFAULT_UNIT;

  return (
    <Pressable
      onPress={() => void onAdd(suggestion)}
      disabled={adding}
      accessibilityRole="button"
      accessibilityLabel={`Add ${suggestion.name} to list`}
      style={({ pressed }) => [{ width, opacity: pressed || adding ? 0.88 : 1 }]}
    >
      <Surface style={[styles.block, { width, minHeight: SUGGEST_BLOCK_HEIGHT }]} elevation={0}>
        <View style={styles.blockAdd}>
          {adding ? (
            <ActivityIndicator size={14} color="#81C784" />
          ) : (
            <Icon source="plus-circle-outline" size={17} color="#81C784" />
          )}
        </View>

        <IngredientThumb name={suggestion.name} size={THUMB_SIZE} resizeMode="contain" />

        <Text variant="labelSmall" style={styles.blockName} numberOfLines={2}>
          {suggestion.name}
        </Text>
        <Text variant="labelSmall" style={styles.blockQty} numberOfLines={1}>
          {qtyLabel}
        </Text>
      </Surface>
    </Pressable>
  );
}

function CarouselArrow({
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
      accessibilityLabel={direction === 'left' ? 'Previous suggestions' : 'More suggestions'}
    >
      <View style={styles.arrowCircle}>
        <Icon source={icon} size={16} color="#7CB342" />
      </View>
    </Pressable>
  );
}

function useSuggestCarouselLayout(screenWidth: number, itemCount: number) {
  return useMemo(() => {
    const frameWidth = screenWidth - SUGGEST_CARD_MARGIN * 2 - SUGGEST_CARD_PAD * 2;
    const blockWidth = Math.floor(
      (frameWidth - SUGGEST_BLOCK_GAP * (SUGGEST_VISIBLE_COLUMNS - 1)) / SUGGEST_VISIBLE_COLUMNS,
    );
    const snapInterval = blockWidth + SUGGEST_BLOCK_GAP;
    const contentWidth = itemCount * blockWidth + Math.max(0, itemCount - 1) * SUGGEST_BLOCK_GAP;
    const scrollable = itemCount > SUGGEST_VISIBLE_COLUMNS || contentWidth > frameWidth + 1;

    return { frameWidth, blockWidth, snapInterval, scrollable };
  }, [screenWidth, itemCount]);
}

export function SuggestOrderCarousel({ suggestions, addingKey, onAdd }: Props) {
  const { width: screenWidth } = useWindowDimensions();
  const { frameWidth, blockWidth, snapInterval, scrollable } = useSuggestCarouselLayout(
    screenWidth,
    suggestions.length,
  );
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
    scrollXRef.current = 0;
    scrollRef.current?.scrollTo({ x: 0, animated: false });
  }, [scrollable, suggestions.length]);

  const updateArrowVisibility = useCallback(
    (x: number, contentWidth: number) => {
      if (!scrollable) {
        setShowLeftArrow(false);
        setShowRightArrow(false);
        return;
      }
      setShowLeftArrow(x > 4);
      setShowRightArrow(x < contentWidth - frameWidth - 4);
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
    const nextX = scrollXRef.current + snapInterval;
    scrollRef.current?.scrollTo({ x: nextX, animated: true });
  }, [snapInterval]);

  const scrollPrev = useCallback(() => {
    const prevX = Math.max(0, scrollXRef.current - snapInterval);
    scrollRef.current?.scrollTo({ x: prevX, animated: true });
  }, [snapInterval]);

  const blocks = suggestions.map((suggestion) => {
    const key = suggestion.name.trim().toLowerCase();
    return (
      <SuggestOrderBlock
        key={key}
        suggestion={suggestion}
        width={blockWidth}
        adding={addingKey === key}
        onAdd={onAdd}
      />
    );
  });

  if (scrollable) {
    return (
      <View style={[styles.frame, { width: frameWidth, height: SUGGEST_BLOCK_HEIGHT }]}>
        <ScrollView
          ref={scrollRef}
          horizontal
          nestedScrollEnabled
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          snapToInterval={snapInterval}
          snapToAlignment="start"
          scrollEventThrottle={16}
          onScroll={onScroll}
          onContentSizeChange={(w) => updateArrowVisibility(scrollXRef.current, w)}
          style={{ width: frameWidth, height: SUGGEST_BLOCK_HEIGHT }}
          contentContainerStyle={styles.scrollContent}
        >
          {blocks}
        </ScrollView>
        <View style={styles.arrowOverlayLeft} pointerEvents="box-none">
          <CarouselArrow direction="left" onPress={scrollPrev} visible={showLeftArrow} />
        </View>
        <View style={styles.arrowOverlayRight} pointerEvents="box-none">
          <CarouselArrow direction="right" onPress={scrollNext} visible={showRightArrow} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.row, { width: frameWidth, minHeight: SUGGEST_BLOCK_HEIGHT }]}>
      {blocks}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    position: 'relative',
    marginTop: 2,
  },
  scrollContent: {
    flexDirection: 'row',
    gap: SUGGEST_BLOCK_GAP,
    alignItems: 'flex-start',
    paddingVertical: 2,
    paddingHorizontal: 2,
  },
  row: {
    flexDirection: 'row',
    gap: SUGGEST_BLOCK_GAP,
    alignItems: 'flex-start',
    marginTop: 2,
    paddingVertical: 2,
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
    marginLeft: -ARROW_SIZE / 2 + 1,
  },
  arrowHitRight: {
    marginRight: -ARROW_SIZE / 2 + 1,
  },
  arrowHitPressed: {
    opacity: 0.72,
  },
  arrowCircle: {
    width: ARROW_SIZE,
    height: ARROW_SIZE,
    borderRadius: ARROW_SIZE / 2,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#2E7D32',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(129, 199, 132, 0.35)',
  },
  block: {
    borderRadius: 12,
    backgroundColor: '#F8FBF8',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(129, 199, 132, 0.22)',
    paddingHorizontal: 6,
    paddingTop: 6,
    paddingBottom: 6,
    position: 'relative',
    alignItems: 'center',
  },
  blockAdd: {
    position: 'absolute',
    top: 2,
    right: 2,
    zIndex: 1,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  blockName: {
    marginTop: 4,
    width: '100%',
    textAlign: 'center',
    fontWeight: '600',
    color: '#4A4A4A',
    lineHeight: 13,
    fontSize: 10,
  },
  blockQty: {
    marginTop: 2,
    width: '100%',
    textAlign: 'center',
    color: '#9E9E9E',
    fontWeight: '500',
    lineHeight: 12,
    fontSize: 9,
  },
});
