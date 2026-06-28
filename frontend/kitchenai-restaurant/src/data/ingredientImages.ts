import type { ImageSourcePropType } from 'react-native';
import { CATALOG_STAPLE_IMAGES } from './catalogStapleImages';
import { resolveIngredientImageId } from './ingredientImageIndex';

export function getIngredientStapleImageSource(
  name?: string | null,
  ingredientId?: string | null,
): ImageSourcePropType | null {
  const id = resolveIngredientImageId(name, ingredientId);
  if (!id) return null;
  const bundled = CATALOG_STAPLE_IMAGES[id];
  return bundled ?? null;
}
