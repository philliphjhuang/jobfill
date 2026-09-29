import type { StoredFile } from './types';

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** Rebuild a DOM File from the stored representation. */
export function storedFileToFile(stored: StoredFile, FileCtor: typeof File = File): File {
  const bytes = base64ToBytes(stored.data);
  return new FileCtor([bytes as BlobPart], stored.name, {
    type: stored.type || 'application/octet-stream',
    lastModified: Date.parse(stored.updatedAt) || Date.now(),
  });
}

export async function fileToStoredFile(file: File): Promise<StoredFile> {
  const buffer = await file.arrayBuffer();
  return {
    name: file.name,
    type: file.type,
    size: file.size,
    data: bytesToBase64(new Uint8Array(buffer)),
    updatedAt: new Date().toISOString(),
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
