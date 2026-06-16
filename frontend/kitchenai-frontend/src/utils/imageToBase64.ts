import { Platform } from 'react-native';

function mimeFromUri(uri: string, hint?: string): string {
  if (hint && hint.trim()) {
    const h = hint.trim().toLowerCase();
    if (h === 'image/jpg') return 'image/jpeg';
    return h;
  }
  const lower = uri.toLowerCase().split('?')[0];
  if (lower.includes('.pdf')) return 'application/pdf';
  if (lower.includes('.png')) return 'image/png';
  if (lower.includes('.webp')) return 'image/webp';
  if (lower.includes('.heic') || lower.includes('.heif')) return 'image/heic';
  return 'image/jpeg';
}

function extensionForMime(mimeHint: string | undefined, uri: string): string {
  const mime = mimeFromUri(uri, mimeHint);
  if (mime === 'application/pdf') return 'pdf';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/heic' || mime === 'image/heif') return 'heic';
  return 'jpg';
}

/** Ensures native URIs use a scheme readable by expo-file-system (file:// or content://). */
export function normalizeNativeFileUri(uri: string): string {
  const trimmed = uri.trim();
  if (!trimmed || trimmed.startsWith('data:')) return trimmed;
  if (
    trimmed.startsWith('file://') ||
    trimmed.startsWith('content://') ||
    trimmed.startsWith('ph://') ||
    trimmed.startsWith('assets-library://')
  ) {
    return trimmed;
  }
  if (trimmed.startsWith('/')) {
    return `file://${trimmed}`;
  }
  return trimmed;
}

async function copyToCacheFile(uri: string, mimeHint?: string): Promise<string> {
  const FileSystem = await import('expo-file-system/legacy');
  const cacheDir = FileSystem.cacheDirectory;
  if (!cacheDir) {
    throw new Error('Could not access app cache to read the selected file');
  }
  const dest = `${cacheDir}bill-scan-${Date.now()}.${extensionForMime(mimeHint, uri)}`;
  await FileSystem.copyAsync({ from: uri, to: dest });
  return dest;
}

async function resolveReadableNativeUri(uri: string, mimeHint?: string): Promise<string> {
  const normalized = normalizeNativeFileUri(uri);
  if (!normalized) {
    throw new Error('No file selected');
  }
  if (normalized.startsWith('content://') || normalized.startsWith('ph://')) {
    return copyToCacheFile(normalized, mimeHint);
  }
  return normalized;
}

async function readNativeFileAsBase64(
  uri: string,
  mimeHint?: string,
): Promise<{ base64: string; mimeType: string }> {
  const readableUri = await resolveReadableNativeUri(uri, mimeHint);
  const mimeType = mimeFromUri(readableUri, mimeHint);

  try {
    const { File } = await import('expo-file-system');
    const file = new File(readableUri);
    if (!file.exists) {
      throw new Error('Could not read the selected file');
    }
    const base64 = await file.base64();
    if (!base64) {
      throw new Error('Could not read the selected file');
    }
    return { base64, mimeType };
  } catch (primaryError) {
    console.warn('File.base64() failed, falling back to legacy file-system:', primaryError);
  }

  let legacyUri = readableUri;
  const FileSystem = await import('expo-file-system/legacy');
  if (legacyUri.startsWith('content://')) {
    legacyUri = await copyToCacheFile(legacyUri, mimeHint);
  }

  try {
    const base64 = await FileSystem.readAsStringAsync(legacyUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    if (!base64) {
      throw new Error('Could not read the selected file');
    }
    return { base64, mimeType };
  } catch (legacyError) {
    console.warn('Legacy readAsStringAsync failed, retrying after cache copy:', legacyError);
    const cachedUri = await copyToCacheFile(uri, mimeHint);
    const base64 = await FileSystem.readAsStringAsync(cachedUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    if (!base64) {
      throw new Error('Could not read the selected file');
    }
    return { base64, mimeType: mimeFromUri(cachedUri, mimeHint) };
  }
}

/** Converts a local file URI (image, PDF, blob, or data URL) to raw base64 + mime type. */
export async function fileUriToBase64(
  uri: string,
  mimeHint?: string,
): Promise<{ base64: string; mimeType: string }> {
  const trimmed = uri.trim();
  if (!trimmed) {
    throw new Error('No file selected');
  }

  if (trimmed.startsWith('data:')) {
    const match = trimmed.match(/^data:([^;]+);base64,([\s\S]+)$/);
    if (!match?.[2]) {
      throw new Error('Invalid file data URL');
    }
    const mimeType = mimeFromUri(trimmed, match[1] || mimeHint);
    return { base64: match[2], mimeType };
  }

  if (Platform.OS === 'web') {
    const response = await fetch(trimmed);
    if (!response.ok) {
      throw new Error('Could not read the selected file');
    }
    const blob = await response.blob();
    const mimeType = mimeFromUri(trimmed, blob.type || mimeHint);
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result !== 'string') {
          reject(new Error('Failed to encode file'));
          return;
        }
        const comma = reader.result.indexOf(',');
        resolve(comma >= 0 ? reader.result.slice(comma + 1) : reader.result);
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(blob);
    });
    return { base64, mimeType };
  }

  return readNativeFileAsBase64(trimmed, mimeHint);
}

/** @deprecated use fileUriToBase64 */
export async function imageUriToBase64(imageUri: string, mimeHint?: string) {
  return fileUriToBase64(imageUri, mimeHint);
}
