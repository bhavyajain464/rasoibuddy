import React, { useEffect, useRef } from 'react';
import {
  InteractionManager,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useProductTour } from '../../context/ProductTourContext';
import { measureTargetRectWithRetry } from '../../tour/measureTargetRect';

type TourTargetProps = {
  id: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onLayoutY?: (y: number) => void;
};

export function TourTarget({ id, children, style, onLayoutY }: TourTargetProps) {
  const ref = useRef<View>(null);
  const layoutSizeRef = useRef<{ width: number; height: number } | null>(null);
  const {
    overlayHostRef,
    registerTarget,
    unregisterTarget,
    requestTargetRemeasure,
    isTourActive,
    activeTargetId,
  } = useProductTour();

  useEffect(() => {
    registerTarget(id, async () => {
      await new Promise<void>((resolve) => {
        InteractionManager.runAfterInteractions(() => resolve());
      });

      return measureTargetRectWithRetry(ref.current, overlayHostRef.current);
    });

    return () => unregisterTarget(id);
  }, [id, overlayHostRef, registerTarget, unregisterTarget]);

  return (
    <View
      ref={ref}
      collapsable={false}
      style={[styles.wrapper, style]}
      onLayout={(event: LayoutChangeEvent) => {
        const { y, width, height } = event.nativeEvent.layout;
        onLayoutY?.(y);

        const prev = layoutSizeRef.current;
        if (prev && prev.width === width && prev.height === height) return;
        layoutSizeRef.current = { width, height };

        if (isTourActive && activeTargetId === id) {
          requestTargetRemeasure(id);
        }
      }}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignSelf: 'stretch',
    flexShrink: 0,
  },
});
