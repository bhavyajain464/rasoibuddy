/** Cook WhatsApp message language codes stored in cook_profile.preferred_lang */
export type CookMessageLang = 'en' | 'hi' | 'hing';

const LEGACY_KANNADA = 'kn';

export function normalizeCookLang(code?: string | null): CookMessageLang {
  const c = (code ?? '').trim().toLowerCase();
  if (c === 'hi') return 'hi';
  if (c === 'hing' || c === LEGACY_KANNADA) return 'hing';
  return 'en';
}

export function cookLanguageLabel(code?: string | null): string {
  switch (normalizeCookLang(code)) {
    case 'hi':
      return 'Hindi';
    case 'hing':
      return 'Hinglish';
    default:
      return 'English';
  }
}

export const COOK_MESSAGE_LANG_OPTIONS: { code: CookMessageLang; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'Hindi' },
  { code: 'hing', label: 'Hinglish' },
];

function cleanDishList(items: string[]): string[] {
  return items.map((s) => s.trim()).filter(Boolean);
}

/** Typical short message households send on WhatsApp — `{item}` is the dish or side. */
export function buildCookMessage(item: string, lang?: string | null): string {
  return buildCookMessageForItems([item], lang);
}

/** Main dish plus selected “pairs with” sides in one WhatsApp-style message. */
export function buildCookMessageForItems(items: string[], lang?: string | null): string {
  const dishes = cleanDishList(items);
  if (dishes.length === 0) return '';

  const list =
    dishes.length === 1
      ? dishes[0]
      : dishes.length === 2
        ? `${dishes[0]} aur ${dishes[1]}`
        : `${dishes.slice(0, -1).join(', ')} aur ${dishes[dishes.length - 1]}`;

  switch (normalizeCookLang(lang)) {
    case 'hi':
      if (dishes.length === 1) {
        return `${dishes[0]} बना दो। कुछ ऑर्डर करना हो तो बता दो।`;
      }
      return `${list} बना दो। कुछ ऑर्डर करना हो तो बता दो।`;
    case 'hing':
      if (dishes.length === 1) {
        return `${dishes[0]} banado. kuch order karna ho to bta do`;
      }
      return `${list} banado. kuch order karna ho to bta do`;
    default:
      if (dishes.length === 1) {
        return `Please make ${dishes[0]}. Let me know if anything needs to be ordered.`;
      }
      return `Please make ${dishes.join(', ')}. Let me know if anything needs to be ordered.`;
  }
}

export function cookMessagePlaceholder(lang?: string | null): string {
  switch (normalizeCookLang(lang)) {
    case 'hi':
      return 'e.g. पनीर बना दो। कुछ ऑर्डर करना हो तो बता दो';
    case 'hing':
      return 'e.g. paneer banado. kuch order karna ho to bta do';
    default:
      return 'e.g. Please make paneer. Let me know if anything needs to be ordered';
  }
}
