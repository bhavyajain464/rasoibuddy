/**
 * Play Store / marketing screenshots for the landing page.
 * Source of truth: assets/play-screenshots/
 * Web copies: public/play-screenshots/ (sync when screenshots change)
 */
export const PLAY_SCREENSHOT_FILES = [
  '01-snap_2026-06-16_08-25-14.png',
  '02-snap_2026-06-16_08-25-32.png',
  '03-snap_2026-06-16_08-25-50.png',
  '04-snap_2026-06-16_08-26-15.png',
  '05-snap_2026-06-16_08-29-43.png',
  '06-snap_2026-06-16_08-31-12.png',
  '07-snap_2026-06-16_08-32-48.png',
  '08-snap_2026-06-16_08-35-12.png',
  '09-snap_2026-06-16_08-48-06.png',
  '10-snap_2026-06-16_12-48-10.png',
  '11-snap_2026-06-16_12-49-26.png',
  '12-snap_2026-06-16_12-49-38.png',
  '13-snap_2026-06-16_13-32-07.png',
] as const;

export const PLAY_SCREENSHOT_COUNT = PLAY_SCREENSHOT_FILES.length;

const PLAY_SCREENSHOT_BASE = '/play-screenshots';

export function playScreenshotSrc(index: number): string {
  const safe = ((index % PLAY_SCREENSHOT_COUNT) + PLAY_SCREENSHOT_COUNT) % PLAY_SCREENSHOT_COUNT;
  return `${PLAY_SCREENSHOT_BASE}/${PLAY_SCREENSHOT_FILES[safe]}`;
}

export function playScreenshotIndices(): number[] {
  return Array.from({ length: PLAY_SCREENSHOT_COUNT }, (_, i) => i);
}

export type PlayShowcaseSlide = {
  screenshotIndex: number;
  title: string;
  description: string;
};

/** Curated slides for the landing-page app showcase carousel (excludes home — shown in hero). */
export const PLAY_SHOWCASE_SLIDES: PlayShowcaseSlide[] = [
  {
    screenshotIndex: 1,
    title: 'Track every ingredient',
    description:
      'See what’s in stock, what’s expiring, and filter by category — no more forgotten veggies.',
  },
  {
    screenshotIndex: 2,
    title: 'Plan your whole week',
    description:
      'Breakfast, lunch, and dinner for every day — shaped by your pantry and preferences.',
  },
  {
    screenshotIndex: 3,
    title: 'Shop smarter',
    description:
      'Suggested items from your meal plan, plus one-tap ordering on Blinkit, Zepto, and more.',
  },
  {
    screenshotIndex: 5,
    title: 'Coordinate with your cook',
    description:
      'Send today’s menu and recipes on WhatsApp in their language — one tap, done.',
  },
  {
    screenshotIndex: 8,
    title: 'Scan bills, fill your pantry',
    description:
      'Photograph or upload a grocery bill — ingredients land in your inventory automatically.',
  },
];

export const PLAY_SHOWCASE_COUNT = PLAY_SHOWCASE_SLIDES.length;

/** Product feature highlights — scan → meals → cook (not onboarding setup). */
export const PLAY_FEATURE_STEPS = [
  {
    screenshotIndex: 8,
    title: 'Scan & stock',
    description:
      'Photograph your grocery bill. Your pantry fills itself with items and expiry dates.',
  },
  {
    screenshotIndex: 4,
    title: 'Get your meals',
    description:
      'Open the app to fresh, personalized meal ideas built around what you already own.',
  },
  {
    screenshotIndex: 5,
    title: 'Cook or delegate',
    description:
      "Cook it yourself, or send the menu to your cook on WhatsApp — and reorder what's running low.",
  },
] as const;

/** Onboarding/setup steps used in landing "How it works". */
export const PLAY_SETUP_STEPS = [
  {
    screenshotIndex: 12,
    title: 'Welcome',
    description:
      'Kick off setup in one tap and we guide you through everything in under two minutes.',
  },
  {
    screenshotIndex: 9,
    title: 'Set your preferences',
    description:
      'Tell us how your home likes to eat so suggestions match your diet, spice level, and cooking style.',
  },
  {
    screenshotIndex: 10,
    secondaryScreenshotIndex: 11,
    title: 'Set up your kitchen',
    description:
      'Start fresh or join a family kitchen — both flows are built right into step 3.',
  },
] as const;

/** Screenshot indices for the “How it works” steps. */
export const PLAY_HOW_STEP_SCREENSHOTS = PLAY_FEATURE_STEPS.map(s => s.screenshotIndex);

/** Native asset requires for onboarding welcome feature cards. */
export const PLAY_FEATURE_STEP_ASSETS = [
  require('../../assets/play-screenshots/09-snap_2026-06-16_08-48-06.png'),
  require('../../assets/play-screenshots/05-snap_2026-06-16_08-29-43.png'),
  require('../../assets/play-screenshots/06-snap_2026-06-16_08-31-12.png'),
] as const;
