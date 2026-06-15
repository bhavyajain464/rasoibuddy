import type { ImageSourcePropType, StyleProp, ViewStyle } from 'react-native';
import { DISH_CARD_IMAGES } from './dishCardImages';
import { resolveDishId } from './dishCatalogIndex';

/** Delivery size variants for photorealistic dish photos (see scripts/optimize-dish-images.mjs). */
export type DishImageVariant = 'hero' | 'card' | 'thumb';

const CDN_BASE = (process.env.EXPO_PUBLIC_DISH_IMAGES_CDN_URL ?? '').replace(/\/$/, '');

/** Path segment per variant under the CDN / dishes bucket. */
function variantPath(id: string, variant: DishImageVariant): string {
  switch (variant) {
    case 'hero':
      return `${id}.webp`;
    case 'card':
      return `card/${id}.webp`;
    case 'thumb':
      return `thumb/${id}.webp`;
  }
}

/**
 * Remote URL for a catalog dish image. Set EXPO_PUBLIC_DISH_IMAGES_CDN_URL to your
 * blob/CDN root (e.g. https://cdn.example.com/dishes). Returns null when unset.
 */
export function getDishImageUrl(id: string, variant: DishImageVariant = 'hero'): string | null {
  if (!CDN_BASE || !id) return null;
  return `${CDN_BASE}/${variantPath(id, variant)}`;
}

/** Pixel dimensions of each exported variant (3:2). */
export const DISH_IMAGE_SIZES: Record<DishImageVariant, { width: number; height: number }> = {
  hero: { width: 1024, height: 683 },
  card: { width: 512, height: 341 },
  thumb: { width: 256, height: 171 },
};

/** Width ÷ height for all dish delivery assets (landscape 3:2). */
export const DISH_IMAGE_ASPECT_RATIO = DISH_IMAGE_SIZES.card.width / DISH_IMAGE_SIZES.card.height;

/** Resolve bundled or CDN image source for a dish. */
export function getDishImageSource(
  dishName?: string | null,
  dishId?: string | null,
  variant: DishImageVariant = 'card',
): ImageSourcePropType | null {
  const id = resolveDishId(dishName, dishId);
  if (!id) return null;

  const remote = getDishImageUrl(id, variant);
  if (remote) return { uri: remote };

  if (variant === 'card' || variant === 'thumb') {
    const local = DISH_CARD_IMAGES[id];
    if (local) return local;
  }

  return null;
}

export type DishImageProps = {
  dishName?: string | null;
  dishId?: string | null;
  variant?: DishImageVariant;
  width?: number | `${number}%`;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

export { resolveDishId };
