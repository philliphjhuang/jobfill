import { createEmptyDocuments, newId, normalizeProfile, normalizeSettings } from './defaults';
import type { Documents, HistoryEntry, Profile, Settings, StoredData, StoredFile } from './types';

/** Minimal subset of chrome.storage.StorageArea so tests can inject a fake. */
export interface KeyValueArea {
  get(keys: string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string[]): Promise<void>;
}

export const STORAGE_KEYS = {
  profile: 'profile',
  settings: 'settings',
  documents: 'documents',
  history: 'history',
} as const;

export const MAX_HISTORY = 200;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

function defaultArea(): KeyValueArea {
  return chrome.storage.local as unknown as KeyValueArea;
}

function isStoredFile(value: unknown): value is StoredFile {
  if (typeof value !== 'object' || value === null) return false;
  const f = value as Record<string, unknown>;
  return typeof f.name === 'string' && typeof f.data === 'string' && typeof f.type === 'string';
}

function normalizeDocuments(raw: unknown): Documents {
  const docs = createEmptyDocuments();
  if (typeof raw === 'object' && raw !== null) {
    const r = raw as Record<string, unknown>;
    if (isStoredFile(r.resume)) docs.resume = r.resume;
    if (isStoredFile(r.coverLetter)) docs.coverLetter = r.coverLetter;
  }
  return docs;
}

export class Store {
  constructor(private readonly area: KeyValueArea = defaultArea()) {}

  async loadProfile(): Promise<Profile> {
    const res = await this.area.get([STORAGE_KEYS.profile]);
    return normalizeProfile(res[STORAGE_KEYS.profile]);
  }

  async loadSettings(): Promise<Settings> {
    const res = await this.area.get([STORAGE_KEYS.settings]);
    return normalizeSettings(res[STORAGE_KEYS.settings]);
  }

  async loadDocuments(): Promise<Documents> {
    const res = await this.area.get([STORAGE_KEYS.documents]);
    return normalizeDocuments(res[STORAGE_KEYS.documents]);
  }

  async loadAll(): Promise<StoredData> {
    const res = await this.area.get([
      STORAGE_KEYS.profile,
      STORAGE_KEYS.settings,
      STORAGE_KEYS.documents,
    ]);
    return {
      profile: normalizeProfile(res[STORAGE_KEYS.profile]),
      settings: normalizeSettings(res[STORAGE_KEYS.settings]),
      documents: normalizeDocuments(res[STORAGE_KEYS.documents]),
    };
  }

  async saveProfile(profile: Profile): Promise<Profile> {
    const toSave = normalizeProfile({ ...profile, updatedAt: new Date().toISOString() });
    await this.area.set({ [STORAGE_KEYS.profile]: toSave });
    return toSave;
  }

  async saveSettings(settings: Settings): Promise<void> {
    await this.area.set({ [STORAGE_KEYS.settings]: normalizeSettings(settings) });
  }

  async saveDocuments(documents: Documents): Promise<void> {
    for (const file of [documents.resume, documents.coverLetter]) {
      if (file && file.size > MAX_FILE_BYTES) {
        throw new Error(`${file.name} is larger than ${MAX_FILE_BYTES / 1024 / 1024} MB.`);
      }
    }
    await this.area.set({ [STORAGE_KEYS.documents]: normalizeDocuments(documents) });
  }

  async loadHistory(): Promise<HistoryEntry[]> {
    const res = await this.area.get([STORAGE_KEYS.history]);
    const list = res[STORAGE_KEYS.history];
    return Array.isArray(list) ? (list as HistoryEntry[]) : [];
  }

  async addHistory(entry: Omit<HistoryEntry, 'id' | 'at'>): Promise<HistoryEntry> {
    const full: HistoryEntry = { ...entry, id: newId(), at: new Date().toISOString() };
    const list = await this.loadHistory();
    list.unshift(full);
    await this.area.set({ [STORAGE_KEYS.history]: list.slice(0, MAX_HISTORY) });
    return full;
  }

  async clearHistory(): Promise<void> {
    await this.area.remove([STORAGE_KEYS.history]);
  }

  async clearAll(): Promise<void> {
    await this.area.remove(Object.values(STORAGE_KEYS));
  }
}
