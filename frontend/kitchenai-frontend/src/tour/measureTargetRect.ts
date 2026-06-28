import type { View } from 'react-native';

export type TargetRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export const MIN_TOUR_TARGET_SIZE = 8;

/** Green tab header body below the status bar (matches TabScreenHeader / Home hero). */
export const FIXED_TAB_HEADER_BODY = 92;

export function isValidTargetRect(rect: TargetRect | null | undefined): rect is TargetRect {
  return Boolean(rect && rect.width >= MIN_TOUR_TARGET_SIZE && rect.height >= MIN_TOUR_TARGET_SIZE);
}

export function measureViewInWindow(node: View | null): Promise<TargetRect | null> {
  return new Promise((resolve) => {
    if (!node) {
      resolve(null);
      return;
    }

    node.measureInWindow((x, y, width, height) => {
      const rect = { x, y, width, height };
      resolve(isValidTargetRect(rect) ? rect : null);
    });
  });
}

type NativeMeasurable = View & {
  measureLayout: (
    relativeToNativeNode: View,
    onSuccess: (x: number, y: number, width: number, height: number) => void,
    onFail: () => void,
  ) => void;
};

/** Preferred: coordinates in the tour overlay host's layout space. */
export function measureViewInHost(
  node: View | null,
  host: View | null,
): Promise<TargetRect | null> {
  return new Promise((resolve) => {
    if (!node || !host) {
      resolve(null);
      return;
    }

    (node as NativeMeasurable).measureLayout(
      host,
      (x, y, width, height) => {
        const rect = { x, y, width, height };
        resolve(isValidTargetRect(rect) ? rect : null);
      },
      () => resolve(null),
    );
  });
}

export async function toHostRelativeRect(
  rect: TargetRect | null,
  host: View | null,
): Promise<TargetRect | null> {
  if (!rect || !host) return rect;

  const hostRect = await measureViewInWindow(host);
  if (!hostRect) return rect;

  return {
    x: rect.x - hostRect.x,
    y: rect.y - hostRect.y,
    width: rect.width,
    height: rect.height,
  };
}

export async function measureTargetRect(
  node: View | null,
  host: View | null,
): Promise<TargetRect | null> {
  const inHost = await measureViewInHost(node, host);
  if (inHost) return inHost;

  const inWindow = await measureViewInWindow(node);
  if (!inWindow) return null;

  return toHostRelativeRect(inWindow, host);
}

export async function measureViewInWindowWithRetry(
  node: View | null,
  attempts = 5,
  delayMs = 80,
): Promise<TargetRect | null> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
    }

    const rect = await measureViewInWindow(node);
    if (rect) return rect;
  }

  return null;
}

export async function measureTargetRectWithRetry(
  node: View | null,
  host: View | null,
  attempts = 6,
  delayMs = 90,
): Promise<TargetRect | null> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
    }

    const rect = await measureTargetRect(node, host);
    if (rect) return rect;
  }

  return null;
}
