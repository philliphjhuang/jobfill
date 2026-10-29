/**
 * Regression: pdf.js transfers (detaches) the buffer it parses, which left the
 * saved resume at 0 B. Simulate a parser that consumes its input and check the
 * stored file is still complete.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/resume/extract', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/resume/extract')>();
  return {
    ...real,
    extractText: vi.fn(async (bytes: Uint8Array, kind: Parameters<typeof real.extractText>[1]) => {
      const text = await real.extractText(bytes.slice(), kind);
      structuredClone(bytes.buffer, { transfer: [bytes.buffer] }); // detach, like postMessage
      return text;
    }),
  };
});

const { runImport } = await import('../../src/options/resume-import');
const { createEmptyDocuments, createEmptyProfile } = await import('../../src/shared/defaults');
const { base64ToBytes } = await import('../../src/shared/files');

describe('resume import keeps the file intact', () => {
  it('saves the full file even when the parser consumes its input', async () => {
    const content = [
      'Jordan Rivera',
      'jordan@example.com | (512) 555-0147 | Austin, TX',
      'Experience',
      'Engineer\tJan 2023 – Present',
      'Lone Star Analytics',
    ].join('\n');
    const bytes = new TextEncoder().encode(content);
    const expectedSize = bytes.length;
    let documents = createEmptyDocuments();
    let profile = createEmptyProfile();

    await runImport(
      {
        profile: () => profile,
        replaceProfile: (p) => (profile = p),
        documents: () => documents,
        saveDocuments: async (d) => {
          documents = d;
        },
        save: () => undefined,
        refresh: () => undefined,
      },
      { bytes, name: 'resume.txt', type: 'text/plain', fromSaved: false },
    );

    expect(bytes.byteLength).toBe(0); // the parser really did consume the input
    expect(documents.resume?.size).toBe(expectedSize);
    expect(new TextDecoder().decode(base64ToBytes(documents.resume!.data))).toBe(content);
    expect(profile.personal.email).toBe('jordan@example.com');
  });
});
