import { Platform } from 'react-native';
import { apiFetch } from '../services/api';
import { MenuImportResult } from '../types';

function filenameFromDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const match = /filename\*?=(?:UTF-8''|")?([^";\n]+)/i.exec(header);
  if (!match?.[1]) return fallback;
  return decodeURIComponent(match[1].replace(/"/g, '').trim());
}

function saveBlobAsFile(blob: Blob, filename: string) {
  if (Platform.OS !== 'web' || typeof document === 'undefined') {
    throw new Error('File download is only supported on web');
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function countDishesInCSV(text: string): number {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '');
  return Math.max(0, lines.length - 1);
}

/** Download menu export as a spreadsheet (.csv) file from the API. */
export async function exportMenuToFile(kitchenId: string): Promise<number> {
  const res = await apiFetch(`/restaurant/${kitchenId}/menu/export`);
  if (!res.ok) {
    throw new Error(await res.text());
  }
  const text = await res.text();
  const filename = filenameFromDisposition(
    res.headers.get('Content-Disposition'),
    `menu-${kitchenId.slice(0, 8)}.csv`,
  );
  saveBlobAsFile(new Blob([text], { type: 'text/csv;charset=utf-8' }), filename);
  return countDishesInCSV(text);
}

/** Open a file picker and return the selected spreadsheet file. */
export function pickMenuSpreadsheetFile(): Promise<File> {
  if (Platform.OS !== 'web' || typeof document === 'undefined') {
    return Promise.reject(new Error('File import is only supported on web'));
  }
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,text/csv,application/vnd.ms-excel';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        reject(new Error('No file selected'));
        return;
      }
      resolve(file);
    };
    input.click();
  });
}

/** Upload a menu spreadsheet file to the import API. */
export async function importMenuFromFile(kitchenId: string, file: File): Promise<MenuImportResult> {
  const form = new FormData();
  form.append('file', file, file.name);
  const res = await apiFetch(`/restaurant/${kitchenId}/menu/import`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) {
    throw new Error(await res.text());
  }
  return res.json() as Promise<MenuImportResult>;
}
