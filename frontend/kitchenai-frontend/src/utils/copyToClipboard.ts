export async function copyToClipboard(text: string): Promise<void> {
  const Clipboard = await import('expo-clipboard');
  await Clipboard.setStringAsync(text);
}
