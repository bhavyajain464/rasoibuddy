import { Platform } from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';

const MAX_BILL_IMAGE_WIDTH = 1600;
const BILL_JPEG_QUALITY = 0.72;

function isPdfUri(uri: string, mimeHint?: string): boolean {
  const mime = (mimeHint || '').toLowerCase();
  if (mime.includes('pdf')) return true;
  return uri.toLowerCase().split('?')[0].endsWith('.pdf');
}

/**
 * Downscales and recompresses bill photos so they stay under backend OCR limits (~4MB).
 * Camera captures are often much larger than gallery picks; skipping this breaks Google Vision OCR.
 */
export async function prepareBillImageForScan(
  uri: string,
  mimeHint?: string,
): Promise<{ uri: string; mimeType: string }> {
  const trimmed = uri.trim();
  if (!trimmed || isPdfUri(trimmed, mimeHint)) {
    return { uri: trimmed, mimeType: mimeHint?.trim() || 'application/pdf' };
  }

  if (Platform.OS === 'web') {
    return { uri: trimmed, mimeType: mimeHint?.trim() || 'image/jpeg' };
  }

  try {
    const result = await ImageManipulator.manipulateAsync(
      trimmed,
      [{ resize: { width: MAX_BILL_IMAGE_WIDTH } }],
      {
        compress: BILL_JPEG_QUALITY,
        format: ImageManipulator.SaveFormat.JPEG,
      },
    );
    return { uri: result.uri, mimeType: 'image/jpeg' };
  } catch (e) {
    console.warn('Bill image prepare failed, using original:', e);
    return { uri: trimmed, mimeType: mimeHint?.trim() || 'image/jpeg' };
  }
}
