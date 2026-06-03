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

  const FileSystem = await import('expo-file-system/legacy');
  const base64 = await FileSystem.readAsStringAsync(trimmed, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return { base64, mimeType: mimeFromUri(trimmed, mimeHint) };
}

/** @deprecated use fileUriToBase64 */
export async function imageUriToBase64(imageUri: string, mimeHint?: string) {
  return fileUriToBase64(imageUri, mimeHint);
}
