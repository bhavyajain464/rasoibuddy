import { Alert, Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';

/** Allowed bill scan uploads — images and PDF only (no video). */
const BILL_FILE_TYPES: string[] = ['image/*', 'application/pdf'];

export type BillScanPick = {
  uri: string;
  mimeType: string;
  name?: string;
};

function isVideoMime(mime: string): boolean {
  return mime.toLowerCase().startsWith('video/');
}

function normalizePick(asset: { uri: string; mimeType?: string | null; name?: string | null }): BillScanPick | null {
  const uri = asset.uri?.trim();
  if (!uri) return null;

  let mimeType = (asset.mimeType || '').trim().toLowerCase();
  const name = asset.name || undefined;

  if (!mimeType || mimeType === 'application/octet-stream') {
    const lower = (name || uri).toLowerCase();
    if (lower.endsWith('.pdf')) mimeType = 'application/pdf';
    else if (lower.endsWith('.png')) mimeType = 'image/png';
    else if (lower.endsWith('.webp')) mimeType = 'image/webp';
    else if (lower.endsWith('.heic') || lower.endsWith('.heif')) mimeType = 'image/heic';
    else mimeType = 'image/jpeg';
  }

  if (mimeType === 'image/jpg') mimeType = 'image/jpeg';
  if (isVideoMime(mimeType)) {
    Alert.alert('Unsupported file', 'Videos cannot be scanned. Choose a photo or PDF of your bill.');
    return null;
  }

  const allowed =
    mimeType === 'application/pdf' ||
    mimeType.startsWith('image/');
  if (!allowed) {
    Alert.alert(
      'Unsupported file',
      'Use a photo (JPEG, PNG, WebP) or a PDF bill. Videos are not supported.',
    );
    return null;
  }

  return { uri, mimeType, name };
}

/** Pick a bill photo from the gallery (images only). */
export async function pickBillImageFromGallery(): Promise<BillScanPick | null> {
  const existing = await ImagePicker.getMediaLibraryPermissionsAsync();
  if (!existing.granted) {
    const requested = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!requested.granted) {
      Alert.alert('Permission Required', 'Photo library access is needed.');
      return null;
    }
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.8,
    allowsEditing: true,
  });

  if (result.canceled || !result.assets[0]) return null;
  const asset = result.assets[0];
  return normalizePick({
    uri: asset.uri,
    mimeType: asset.mimeType || 'image/jpeg',
    name: asset.fileName ?? undefined,
  });
}

/** Web-only fallback; mobile uses in-app camera via expo-camera. */
export async function pickBillImageFromCameraWeb(): Promise<BillScanPick | null> {
  const existing = await ImagePicker.getCameraPermissionsAsync();
  if (!existing.granted) {
    const requested = await ImagePicker.requestCameraPermissionsAsync();
    if (!requested.granted) {
      Alert.alert('Permission Required', 'Camera access is needed to scan bills.');
      return null;
    }
  }

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    quality: 0.8,
    allowsEditing: true,
  });

  if (result.canceled || !result.assets[0]) return null;
  const asset = result.assets[0];
  return normalizePick({
    uri: asset.uri,
    mimeType: asset.mimeType || 'image/jpeg',
    name: asset.fileName ?? undefined,
  });
}

/** Pick an image or PDF from files (no video). */
export async function pickBillFileFromDevice(): Promise<BillScanPick | null> {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: BILL_FILE_TYPES,
      copyToCacheDirectory: true,
      multiple: false,
    });

    if (result.canceled || !result.assets?.[0]) return null;
    return normalizePick(result.assets[0]);
  } catch {
    Alert.alert('Could not open files', 'Try again or use Camera instead.');
    return null;
  }
}

export function isPdfBillPick(pick: BillScanPick): boolean {
  return pick.mimeType === 'application/pdf';
}

export async function pickBillImageUriFromGallery(): Promise<string | null> {
  const pick = await pickBillImageFromGallery();
  return pick?.uri ?? null;
}
