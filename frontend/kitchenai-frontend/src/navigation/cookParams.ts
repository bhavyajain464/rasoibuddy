export type CookScreenMode = 'cook' | 'cooking';

export type CookRouteParams = {
  dishItems?: string[];
  dishName?: string;
  dishId?: string;
  mode?: CookScreenMode;
  /** Bumps on each navigation so the Cook tab reapplies params when already focused. */
  at?: number;
};

export function normalizeCookMode(mode?: string): CookScreenMode {
  return mode === 'cooking' ? 'cooking' : 'cook';
}

export function cookNavParams(params: CookRouteParams): CookRouteParams {
  return { ...params, at: Date.now() };
}
