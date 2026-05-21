import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

function mimeFromUri(uri: string): string {
  if (uri.includes('.png')) return 'image/png';
  return 'image/jpeg';
}

/** Converts a local image URI (file, content, blob, or data URL) to raw base64 + mime type. */
export async function imageUriToBase64(imageUri: string): Promise<{ base64: string; mimeType: string }> {
  const uri = imageUri.trim();
  if (!uri) {
    throw new Error('No image selected');
  }

  if (uri.startsWith('data:')) {
    const match = uri.match(/^data:([^;]+);base64,([\s\S]+)$/);
    if (!match?.[2]) {
      throw new Error('Invalid image data URL');
    }
    return { base64: match[2], mimeType: match[1] || 'image/jpeg' };
  }

  if (Platform.OS === 'web') {
    const response = await fetch(uri);
    if (!response.ok) {
      throw new Error('Could not read the selected image');
    }
    const blob = await response.blob();
    const mimeType = blob.type || mimeFromUri(uri);
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result !== 'string') {
          reject(new Error('Failed to encode image'));
          return;
        }
        const comma = reader.result.indexOf(',');
        resolve(comma >= 0 ? reader.result.slice(comma + 1) : reader.result);
      };
      reader.onerror = () => reject(new Error('Failed to read image file'));
      reader.readAsDataURL(blob);
    });
    return { base64, mimeType };
  }

  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return { base64, mimeType: mimeFromUri(uri) };
}
