import { describe, expect, it } from 'vitest';
import {
  openReviewDialog,
  runImport,
  type Decision,
  type ImportHost,
} from '../../src/options/resume-import';
import {
  createEmptyDocuments,
  createEmptyProfile,
  createWorkExperience,
} from '../../src/shared/defaults';
import type { Documents, Profile } from '../../src/shared/types';

const RESUME = [
  'Jordan Rivera',
  'jordan@example.com | (512) 555-0147 | Austin, TX',
  'Experience',
  'Senior Software Engineer\tJan 2023 – Present',
  'Lone Star Analytics',
  '• Led the platform team.',
  'Skills',
  'TypeScript, React',
].join('\n');

function host(profile: Profile, documents: Documents = createEmptyDocuments()) {
  const state = { profile, documents, saves: 0, refreshes: 0 };
  const api: ImportHost = {
    profile: () => state.profile,
    replaceProfile: (p) => (state.profile = p),
    documents: () => state.documents,
    saveDocuments: async (d) => {
      state.documents = d;
    },
    save: () => state.saves++,
    refresh: () => state.refreshes++,
  };
  return { state, api };
}

const source = (name = 'resume.txt') => ({
  bytes: new TextEncoder().encode(RESUME),
  name,
  type: 'text/plain',
  fromSaved: false,
});

const click = (root: ParentNode, selector: string, index = 0) =>
  root.querySelectorAll<HTMLButtonElement>(selector)[index]!.click();
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('resume import flow', () => {
  it('fills an empty profile immediately and saves the resume file', async () => {
    const { state, api } = host(createEmptyProfile());
    const result = await runImport(api, source());
    expect(result.review).toEqual([]);
    expect(state.profile.personal.email).toBe('jordan@example.com');
    expect(state.profile.work[0]!.company).toBe('Lone Star Analytics');
    expect(state.documents.resume?.name).toBe('resume.txt');
    expect(result.filled.some((f) => f.label === 'Resume file')).toBe(true);
    expect(state.saves).toBeGreaterThan(0);
    expect(state.refreshes).toBe(1);
  });

  it('asks about fields that already have a different value', async () => {
    const profile = createEmptyProfile();
    profile.personal.email = 'old@example.com';
    profile.skills = 'Go';
    const docs = {
      ...createEmptyDocuments(),
      resume: { name: 'old.pdf', type: 'application/pdf', size: 10, data: '', updatedAt: '' },
    };
    const { state, api } = host(profile, docs);
    const result = await runImport(api, source());
    expect(result.review.map((r) => r.label)).toEqual([
      'Email',
      'Skills',
      'Resume file used for uploads',
    ]);
    // Nothing that had a value was changed yet.
    expect(state.profile.personal.email).toBe('old@example.com');
    expect(state.documents.resume?.name).toBe('old.pdf');
    // Empty fields were filled.
    expect(state.profile.personal.firstName).toBe('Jordan');
  });

  it('rejects unsupported and empty files', async () => {
    const { api } = host(createEmptyProfile());
    await expect(
      runImport(api, { ...source(), name: 'resume.doc', type: 'application/msword' }),
    ).rejects.toThrow(/PDF, Word/);
    await expect(
      runImport(api, { ...source(), bytes: new TextEncoder().encode('hi') }),
    ).rejects.toThrow(/No text/);
  });
});

describe('review dialog — Yes / No / Edit', () => {
  async function setup() {
    const profile = createEmptyProfile();
    profile.personal.email = 'old@example.com';
    profile.skills = 'Go';
    profile.work = [
      { ...createWorkExperience(), company: 'Lone Star Analytics', title: 'Engineer' },
    ];
    const { state, api } = host(profile);
    const result = await runImport(api, { ...source(), fromSaved: true });
    let decisions: Decision[] | null = null;
    const dialog = openReviewDialog(result.review, (d) => (decisions = d));
    return { state, result, dialog, decisions: () => decisions };
  }

  it('lists each conflict with current and resume values', async () => {
    const { dialog, result } = await setup();
    expect(result.review.map((r) => r.label)).toEqual([
      'Email',
      'Skills',
      'Work · Lone Star Analytics — Job title',
      'Work · Lone Star Analytics — Currently work here',
    ]);
    const first = dialog.querySelector('.conflict')!;
    expect(first.textContent).toContain('old@example.com');
    expect(first.textContent).toContain('jordan@example.com');
    const buttons = Array.from(first.querySelectorAll('.actions button')).map((b) => b.textContent);
    expect(buttons).toEqual(['Yes', 'No', 'Edit']);
  });

  it('Yes replaces, No keeps, Edit saves the edited value, Undo reverts', async () => {
    const { dialog, state, decisions } = await setup();
    const cards = dialog.querySelectorAll<HTMLElement>('.conflict');

    click(cards[0]!, 'button.yes');
    await tick();
    expect(state.profile.personal.email).toBe('jordan@example.com');
    expect(cards[0]!.dataset.state).toBe('replaced');

    click(cards[1]!, 'button.no');
    await tick();
    expect(state.profile.skills).toBe('Go');

    click(cards[2]!, 'button.edit');
    const input = cards[2]!.querySelector<HTMLInputElement>('.editor input')!;
    expect(input.value).toBe('Senior Software Engineer');
    input.value = 'Staff Software Engineer';
    click(cards[2]!, '.editor button.primary');
    await tick();
    expect(state.profile.work[0]!.title).toBe('Staff Software Engineer');
    expect(cards[2]!.dataset.state).toBe('edited');

    click(cards[0]!, '.outcome button.link'); // Undo
    await tick();
    expect(state.profile.personal.email).toBe('old@example.com');
    expect(cards[0]!.dataset.state).toBe('pending');

    click(dialog, 'footer button.primary'); // Done
    expect(decisions()).toEqual(['pending', 'kept', 'edited', 'pending']);
    expect(dialog.isConnected).toBe(false);
    // Unanswered fields keep their value.
    expect(state.profile.work[0]!.current).toBe(false);
  });

  it('"Yes to all remaining" answers only unanswered fields', async () => {
    const { dialog, state } = await setup();
    const cards = dialog.querySelectorAll<HTMLElement>('.conflict');
    click(cards[1]!, 'button.no');
    await tick();
    click(dialog, 'footer button', 1);
    await tick();
    await tick();
    expect(state.profile.personal.email).toBe('jordan@example.com');
    expect(state.profile.skills).toBe('Go');
    expect(state.profile.work[0]!.current).toBe(true);
  });
});
