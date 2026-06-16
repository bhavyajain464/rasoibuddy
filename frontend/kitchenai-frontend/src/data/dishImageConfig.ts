let dishImagesCdnBase =
  (process.env.EXPO_PUBLIC_DISH_IMAGES_CDN_URL ?? '').replace(/\/$/, '');

/** CDN root for dish photos (from /app/config or EXPO_PUBLIC_DISH_IMAGES_CDN_URL). */
export function getDishImagesCdnBase(): string {
  return dishImagesCdnBase;
}

export function setDishImagesCdnBase(url: string | undefined | null): void {
  dishImagesCdnBase = (url ?? '').replace(/\/$/, '');
}
