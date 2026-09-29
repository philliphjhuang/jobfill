import { describe, expect, it } from 'vitest';
import {
  completenessPercent,
  isProfileEmpty,
  profileChecklist,
} from '../../src/shared/completeness';
import {
  createEmptyProfile,
  DEFAULT_SETTINGS,
  mergeWithDefaults,
  normalizeProfile,
} from '../../src/shared/defaults';
import {
  base64ToBytes,
  bytesToBase64,
  formatBytes,
  storedFileToFile,
} from '../../src/shared/files';
import { mergeFrameReports, type FrameReport } from '../../src/shared/report';
import { MAX_FILE_BYTES, MAX_HISTORY, Store, type KeyValueArea } from '../../src/shared/storage';
import { sampleData, sampleProfile } from '../helpers/fixtures';

class MemoryArea implements KeyValueArea {
  data: Record<string, unknown> = {};
  async get(keys: string[]) {
    return Object.fromEntries(
      keys.filter((k) => k in this.data).map((k) => [k, structuredClone(this.data[k])]),
    );
  }
  async set(items: Record<string, unknown>) {
    Object.assign(this.data, structuredClone(items));
  }
  async remove(keys: string[]) {
    keys.forEach((k) => delete this.data[k]);
  }
}

describe('defaults & migration', () => {
  it('fills in fields missing from older saved data and drops unknown keys', () => {
    const migrated = normalizeProfile({
      personal: { firstName: 'Ada', unknown: 'x' },
      work: [{ company: 'Acme' }, 'garbage'],
      eeo: { race: ['asian', 7] },
    });
    expect(migrated.personal.firstName).toBe('Ada');
    expect(migrated.personal.email).toBe('');
    expect((migrated.personal as unknown as Record<string, unknown>).unknown).toBeUndefined();
    expect(migrated.work).toHaveLength(1);
    expect(migrated.work[0]!.current).toBe(false);
    expect(migrated.work[0]!.id).toBeTruthy();
    expect(migrated.eeo.race).toEqual(['asian']);
  });

  it('rejects values of the wrong type', () => {
    const merged = mergeWithDefaults(
      { ...DEFAULT_SETTINGS },
      { overwriteExisting: 'yes', fillEeo: false },
    );
    expect(merged.overwriteExisting).toBe(false);
    expect(merged.fillEeo).toBe(false);
  });
});

describe('Store', () => {
  it('round-trips profile, settings and documents', async () => {
    const store = new Store(new MemoryArea());
    const { profile, documents } = sampleData();
    const saved = await store.saveProfile(profile);
    expect(saved.updatedAt).not.toBe('');
    await store.saveSettings({ ...DEFAULT_SETTINGS, fillEeo: false });
    await store.saveDocuments(documents);
    const all = await store.loadAll();
    expect(all.profile.personal.email).toBe('ada@example.com');
    expect(all.settings.fillEeo).toBe(false);
    expect(all.documents.resume?.name).toBe('Ada_Lovelace_Resume.pdf');
  });

  it('returns defaults when nothing is stored', async () => {
    const all = await new Store(new MemoryArea()).loadAll();
    expect(all.profile).toEqual(createEmptyProfile());
    expect(all.settings).toEqual(DEFAULT_SETTINGS);
    expect(all.documents).toEqual({ resume: null, coverLetter: null });
  });

  it('refuses oversized files', async () => {
    const store = new Store(new MemoryArea());
    const big = {
      name: 'big.pdf',
      type: 'application/pdf',
      size: MAX_FILE_BYTES + 1,
      data: '',
      updatedAt: '',
    };
    await expect(store.saveDocuments({ resume: big, coverLetter: null })).rejects.toThrow(
      /larger than/,
    );
  });

  it('caps the application log', async () => {
    const area = new MemoryArea();
    area.data.history = Array.from({ length: MAX_HISTORY }, (_, i) => ({ id: String(i) }));
    const store = new Store(area);
    await store.addHistory({
      url: 'https://x',
      host: 'x',
      title: 'Job',
      ats: null,
      filled: 1,
      requiredMissing: 0,
      optionalMissing: 0,
    });
    const history = await store.loadHistory();
    expect(history).toHaveLength(MAX_HISTORY);
    expect(history[0]!.title).toBe('Job');
    await store.clearHistory();
    expect(await store.loadHistory()).toEqual([]);
  });

  it('deletes everything', async () => {
    const area = new MemoryArea();
    const store = new Store(area);
    await store.saveProfile(sampleProfile());
    await store.clearAll();
    expect(area.data).toEqual({});
  });
});

describe('files', () => {
  it('converts between bytes, base64 and File', async () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 255]);
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
    const file = storedFileToFile({
      name: 'cv.pdf',
      type: 'application/pdf',
      size: 5,
      data: bytesToBase64(bytes),
      updatedAt: '',
    });
    expect(file.name).toBe('cv.pdf');
    expect(file.type).toBe('application/pdf');
    expect(file.size).toBe(bytes.length); // jsdom's File has no arrayBuffer()
    expect(formatBytes(2048)).toBe('2.0 KB');
  });
});

describe('completeness', () => {
  it('scores an empty and a full profile', () => {
    const empty = createEmptyProfile();
    expect(isProfileEmpty(empty)).toBe(true);
    expect(completenessPercent(empty, { resume: null, coverLetter: null })).toBe(0);
    const { profile, documents } = sampleData();
    expect(completenessPercent(profile, documents)).toBe(100);
    expect(
      profileChecklist(profile, { resume: null, coverLetter: null }).find((i) => !i.done)?.section,
    ).toBe('documents');
  });
});

describe('mergeFrameReports', () => {
  const frame = (over: Partial<FrameReport>): FrameReport => ({
    url: 'https://jobs.example.com/apply',
    title: 'Apply',
    isTop: true,
    ats: null,
    fields: [],
    missing: [],
    durationMs: 10,
    ...over,
  });

  it('combines frames, tags frame ids and sorts required first', () => {
    const report = mergeFrameReports('fill', [
      {
        frameId: 0,
        report: frame({
          fields: [
            { label: 'Email', kind: 'text', type: 'email', status: 'filled', required: true },
          ],
          missing: [{ ref: 0, label: 'Nickname', kind: 'text', required: false }],
        }),
      },
      {
        frameId: 7,
        report: frame({
          isTop: false,
          url: 'https://boards.greenhouse.io/x',
          ats: 'Greenhouse',
          fields: [
            { label: 'Name', kind: 'text', type: 'fullName', status: 'filled', required: true },
          ],
          missing: [{ ref: 0, label: 'Why us?', kind: 'textarea', required: true }],
        }),
      },
      { frameId: 9, report: null },
    ]);
    expect(report.url).toBe('https://jobs.example.com/apply');
    expect(report.ats).toBe('Greenhouse');
    expect(report.filledCount).toBe(2);
    expect(report.missing.map((m) => [m.label, m.frameId])).toEqual([
      ['Why us?', 7],
      ['Nickname', 0],
    ]);
    expect(report.requiredMissing).toBe(1);
    expect(report.optionalMissing).toBe(1);
    expect(report.noForm).toBe(false);
  });

  it('flags pages without forms and collects errors', () => {
    const report = mergeFrameReports(
      'verify',
      [{ frameId: 0, report: frame({ error: 'boom' }) }],
      true,
    );
    expect(report.noForm).toBe(true);
    expect(report.errors).toEqual(['boom']);
    expect(report.profileEmpty).toBe(true);
  });
});
