import React, { useMemo } from 'react';
import {
  Dimensions,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { Button, Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getTabBarReservedHeight } from '../../hooks/useTabBarLayout';
import { palette } from '../../theme';
import type { AppTourStep } from '../../tour/appTourSteps';
import type { TargetRect } from '../../context/ProductTourContext';

const HIGHLIGHT_PADDING = 8;
const HIGHLIGHT_RADIUS = 14;
const TOOLTIP_MAX_WIDTH = 320;
const MIN_TARGET_SIZE = 8;
const TOOLTIP_HEIGHT_ESTIMATE = 200;

type ProductTourOverlayProps = {
  visible: boolean;
  step: AppTourStep | null;
  stepIndex: number;
  stepCount: number;
  targetRect: TargetRect | null;
  onNext: () => void;
  onSkip: () => void;
};

export function ProductTourOverlay({
  visible,
  step,
  stepIndex,
  stepCount,
  targetRect,
  onNext,
  onSkip,
}: ProductTourOverlayProps) {
  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = Dimensions.get('window');
  const tabBarReserve = getTabBarReservedHeight(insets.bottom);
  const isTabBarStep = step?.id === 'tabs';

  const highlight = useMemo(() => {
    if (!targetRect || targetRect.width < MIN_TARGET_SIZE || targetRect.height < MIN_TARGET_SIZE) {
      return null;
    }

    if (isTabBarStep) {
      const y = Math.max(0, targetRect.y - HIGHLIGHT_PADDING);
      return {
        x: 0,
        y,
        width: screenW,
        height: screenH - y,
      };
    }

    const maxBottom = screenH - tabBarReserve;
    let width = Math.min(screenW - HIGHLIGHT_PADDING * 2, targetRect.width + HIGHLIGHT_PADDING * 2);
    let height = targetRect.height + HIGHLIGHT_PADDING * 2;
    let x = targetRect.x - HIGHLIGHT_PADDING;
    let y = targetRect.y - HIGHLIGHT_PADDING;

    x = Math.max(HIGHLIGHT_PADDING, Math.min(x, screenW - width - HIGHLIGHT_PADDING));
    y = Math.max(HIGHLIGHT_PADDING, Math.min(y, maxBottom - MIN_TARGET_SIZE));

    if (y + height > maxBottom) {
      height = Math.max(MIN_TARGET_SIZE, maxBottom - y);
    }

    return { x, y, width, height };
  }, [isTabBarStep, screenH, screenW, tabBarReserve, targetRect]);

  const tooltipStyle = useMemo(() => {
    if (!step) return null;

    if (step.placement === 'center' || !step.targetId || !highlight) {
      const maxTop = screenH - tabBarReserve - TOOLTIP_HEIGHT_ESTIMATE - 16;
      return {
        top: Math.min(screenH * 0.32, Math.max(insets.top + 16, maxTop)),
        left: 24,
        right: 24,
      };
    }

    const cardHeightEstimate = TOOLTIP_HEIGHT_ESTIMATE;
    const belowTop = highlight.y + highlight.height + 16;
    const aboveTop = highlight.y - cardHeightEstimate - 16;
    const preferBelow = step.placement === 'below';
    const maxTooltipBottom = screenH - tabBarReserve - 8;
    const fitsBelow = belowTop + cardHeightEstimate < maxTooltipBottom;
    const fitsAbove = aboveTop > insets.top + 16;

    let top = preferBelow ? belowTop : aboveTop;
    if (preferBelow && !fitsBelow && fitsAbove) {
      top = aboveTop;
    } else if (!preferBelow && !fitsAbove && fitsBelow) {
      top = belowTop;
    }

    top = Math.max(insets.top + 16, top);
    top = Math.min(top, maxTooltipBottom - cardHeightEstimate);

    return {
      top,
      left: 24,
      right: 24,
    };
  }, [highlight, insets.top, screenH, step, tabBarReserve]);

  if (!visible || !step) {
    return null;
  }

  const isCenterStep = step.placement === 'center' || !step.targetId;
  if (!isCenterStep && !highlight) {
    return null;
  }

  const isLastStep = stepIndex >= stepCount - 1;

  return (
    <View style={styles.overlay} pointerEvents="box-none" accessibilityViewIsModal>
      {highlight ? (
        <>
          <Pressable
            style={[styles.scrimBlock, { top: 0, left: 0, right: 0, height: highlight.y }]}
            onPress={() => {}}
            accessibilityElementsHidden
          />
          <Pressable
            style={[
              styles.scrimBlock,
              { top: highlight.y, left: 0, width: highlight.x, height: highlight.height },
            ]}
            onPress={() => {}}
            accessibilityElementsHidden
          />
          <Pressable
            style={[
              styles.scrimBlock,
              {
                top: highlight.y,
                left: highlight.x + highlight.width,
                right: 0,
                height: highlight.height,
              },
            ]}
            onPress={() => {}}
            accessibilityElementsHidden
          />
          <Pressable
            style={[
              styles.scrimBlock,
              {
                top: highlight.y + highlight.height,
                left: 0,
                right: 0,
                bottom: 0,
              },
            ]}
            onPress={() => {}}
            accessibilityElementsHidden
          />
          <View
            pointerEvents="none"
            style={[
              styles.highlightRing,
              {
                top: highlight.y,
                left: highlight.x,
                width: highlight.width,
                height: highlight.height,
                borderRadius: HIGHLIGHT_RADIUS,
              },
            ]}
          />
        </>
      ) : (
        <Pressable
          style={[StyleSheet.absoluteFill, styles.fullScrim]}
          onPress={() => {}}
          accessibilityElementsHidden
        />
      )}

      <View
        style={[
          styles.tooltip,
          tooltipStyle,
          { paddingBottom: Math.max(insets.bottom, 12) },
        ]}
      >
        <View style={styles.tooltipHeader}>
          <View style={styles.stepDots} accessibilityLabel={`Step ${stepIndex + 1} of ${stepCount}`}>
            {Array.from({ length: stepCount }).map((_, i) => (
              <View key={i} style={[styles.stepDot, i === stepIndex && styles.stepDotActive]} />
            ))}
          </View>
          <Pressable
            onPress={onSkip}
            accessibilityRole="button"
            accessibilityLabel="Skip tour"
            hitSlop={8}
          >
            <Text style={styles.skipText}>Skip</Text>
          </Pressable>
        </View>

        <Text variant="titleMedium" style={styles.tooltipTitle}>
          {step.title}
        </Text>
        <Text variant="bodyMedium" style={styles.tooltipBody}>
          {step.body}
        </Text>

        <Button
          mode="contained"
          onPress={onNext}
          style={styles.nextBtn}
          contentStyle={styles.nextBtnContent}
          labelStyle={styles.nextBtnLabel}
          accessibilityRole="button"
          accessibilityLabel={isLastStep ? 'Finish tour' : 'Next step'}
        >
          {isLastStep ? 'Done' : 'Next'}
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    elevation: 1000,
  },
  scrimBlock: {
    position: 'absolute',
    backgroundColor: 'rgba(0, 0, 0, 0.62)',
  },
  fullScrim: {
    backgroundColor: 'rgba(0, 0, 0, 0.62)',
  },
  highlightRing: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: palette.primarySoft,
    backgroundColor: 'transparent',
  },
  tooltip: {
    position: 'absolute',
    backgroundColor: palette.surface,
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingTop: 16,
    maxWidth: TOOLTIP_MAX_WIDTH,
    alignSelf: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 8,
  },
  tooltipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  stepDots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stepDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: palette.border,
  },
  stepDotActive: {
    width: 16,
    backgroundColor: palette.primary,
  },
  skipText: {
    color: palette.textMuted,
    fontWeight: '600',
    fontSize: 14,
  },
  tooltipTitle: {
    fontWeight: '800',
    color: palette.text,
    marginBottom: 6,
  },
  tooltipBody: {
    color: palette.textSecondary,
    lineHeight: 21,
    marginBottom: 16,
  },
  nextBtn: {
    borderRadius: 12,
    marginBottom: 4,
  },
  nextBtnContent: {
    paddingVertical: 4,
  },
  nextBtnLabel: {
    fontWeight: '700',
    fontSize: 15,
  },
});
