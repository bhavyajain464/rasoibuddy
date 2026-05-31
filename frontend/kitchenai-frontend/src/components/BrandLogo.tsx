import React from 'react';
import { Image, ImageStyle, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { brandLogo, BRAND_HEADER_BG } from '../constants/brand';

type BrandLogoProps = {
  width?: number;
  height?: number;
  style?: StyleProp<ViewStyle>;
  imageStyle?: StyleProp<ImageStyle>;
  /** Login header: paint same matte behind image (avoids scaling fringe). */
  onHeaderMatte?: boolean;
};

/** Full Kitchmate logo (chef + cart + wordmark). */
export function BrandLogo({
  width = 280,
  height = 218,
  style,
  imageStyle,
  onHeaderMatte = false,
}: BrandLogoProps) {
  const matte = onHeaderMatte ? { backgroundColor: BRAND_HEADER_BG } : null;

  return (
    <View style={[styles.wrap, matte, { width, height }, style]}>
      <Image
        source={brandLogo}
        style={[styles.image, matte, { width, height }, imageStyle]}
        resizeMode="contain"
        accessibilityRole="image"
        accessibilityLabel="Kitchmate logo"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
