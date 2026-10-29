/**
 * "Fill from resume" in the profile editor: read a resume file locally,
 * fill every empty profile field right away, and ask Yes / No / Edit for
 * every field that already holds a different value.
 */
import { extractText, resumeKind } from '../resume/extract';
import { applyChange, planImport, type ChangeKind, type FieldChange } from '../resume/merge';
import { parseResume } from '../resume/parse';
import { base64ToBytes, bytesToBase64, formatBytes } from '../shared/files';
import { MAX_FILE_BYTES } from '../shared/storage';
import type { Documents, Profile, StoredFile } from '../shared/types';
import { append, clear, h } from '../ui/h';

/** What the importer needs from the editor that hosts it. */
export interface ImportHost {
  profile(): Profile;
  replaceProfile(profile: Profile): void;
  documents(): Documents;
  saveDocuments(documents: Documents): Promise<void>;
  /** Persist the profile (debounced). */
  save(): void;
  /** Re-render the editor so it shows the new values. */
  refresh(): void;
}

export type Decision = 'pending' | 'replaced' | 'kept' | 'edited';

/** One question in the review dialog. */
export interface ReviewItem {
  label: string;
  kind: ChangeKind;
  current: string;
  proposed: string;
  apply(value: string): Promise<void> | void;
  revert(): Promise<void> | void;
}

export interface ImportResult {
  filled: Array<{ label: string; value: string }>;
  review: ReviewItem[];
  addedWork: number;
  addedEducation: number;
}

export interface ImportSource {
  bytes: Uint8Array;
  name: string;
  type: string;
  /** True when importing the resume already saved in Documents. */
  fromSaved: boolean;
}

function storedFile(source: ImportSource): StoredFile {
  return {
    name: source.name,
    type: source.type || 'application/octet-stream',
    size: source.bytes.length,
    data: bytesToBase64(source.bytes),
    updatedAt: new Date().toISOString(),
  };
}

/** Parse the resume, fill empty fields, and return what still needs a decision. */
export async function runImport(host: ImportHost, source: ImportSource): Promise<ImportResult> {
  const kind = resumeKind(source.name, source.type);
  if (!kind) throw new Error('Choose a PDF, Word (.docx) or plain-text resume.');
  if (source.bytes.length > MAX_FILE_BYTES) {
    throw new Error(`The file is too large (${formatBytes(source.bytes.length)}).`);
  }
  // Snapshot the file before parsing: parsers may consume the bytes they are given.
  const incoming = storedFile(source);
  const extracted = await extractText(source.bytes, kind);
  if (extracted.lines.join('').replace(/\s/g, '').length < 40) {
    throw new Error(
      'No text was found in this file. If it is a scanned image, export it as a text-based PDF or .docx first.',
    );
  }
  const { profile, plan } = planImport(host.profile(), parseResume(extracted));
  host.replaceProfile(profile);
  host.save();

  const review: ReviewItem[] = plan.conflicts.map((change: FieldChange) => ({
    label: change.label,
    kind: change.kind,
    current: change.current,
    proposed: change.proposed,
    apply: (value) => {
      applyChange(host.profile(), change, value);
      host.save();
    },
    revert: () => {
      applyChange(host.profile(), change, change.current);
      host.save();
    },
  }));
  const filled = plan.filled.map((c) => ({ label: c.label, value: c.proposed }));

  if (!source.fromSaved) {
    const docs = host.documents();
    const previous = docs.resume;
    if (!previous) {
      await host.saveDocuments({ ...docs, resume: incoming });
      filled.push({ label: 'Resume file', value: incoming.name });
    } else if (previous.name !== incoming.name || previous.size !== incoming.size) {
      review.push({
        label: 'Resume file used for uploads',
        kind: 'file',
        current: `${previous.name} (${formatBytes(previous.size)})`,
        proposed: `${incoming.name} (${formatBytes(incoming.size)})`,
        apply: () => host.saveDocuments({ ...host.documents(), resume: incoming }),
        revert: () => host.saveDocuments({ ...host.documents(), resume: previous }),
      });
    }
  }

  host.refresh();
  return { filled, review, addedWork: plan.addedWork, addedEducation: plan.addedEducation };
}

// ── Review dialog ────────────────────────────────────────────────────────────

function editorFor(
  kind: ChangeKind,
  value: string,
): HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
  if (kind === 'textarea') return h('textarea', { rows: 5, value });
  if (kind === 'yesno') {
    return h(
      'select',
      null,
      ...['Yes', 'No'].map((v) => h('option', { value: v, selected: v === value }, v)),
    );
  }
  return h('input', { type: kind === 'month' ? 'month' : 'text', value });
}

const OUTCOME_TEXT: Record<Exclude<Decision, 'pending'>, string> = {
  replaced: '✓ Replaced with the value from your resume',
  kept: 'Kept your current value',
  edited: '✓ Saved your edited value',
};

/**
 * Modal list of fields that already had a value. Each gets Yes (replace),
 * No (keep) or Edit (adjust the resume value, then save). Closing the dialog
 * keeps every field that was not answered.
 */
export function openReviewDialog(
  items: ReviewItem[],
  onClose: (decisions: Decision[]) => void,
): HTMLDialogElement {
  const decisions: Decision[] = items.map(() => 'pending');
  const remaining = h('span', { class: 'remaining', attrs: { 'aria-live': 'polite' } });
  const updateRemaining = (): void => {
    const left = decisions.filter((d) => d === 'pending').length;
    remaining.textContent = left ? `${left} of ${items.length} still to answer` : 'All answered';
  };
  const setters: Array<(d: Decision, value?: string) => Promise<void>> = [];

  const cards = items.map((item, i) => {
    const proposedEl = h('div', { class: 'val proposed' }, item.proposed);
    const editor = editorFor(item.kind, item.proposed);
    const editBox = h(
      'div',
      { class: 'editor', hidden: true },
      editor,
      h(
        'div',
        { class: 'row' },
        h(
          'button',
          {
            type: 'button',
            class: 'primary',
            on: { click: () => void set('edited', editor.value) },
          },
          'Save',
        ),
        h(
          'button',
          {
            type: 'button',
            on: {
              click: () => {
                editBox.hidden = true;
                actions.hidden = false;
              },
            },
          },
          'Cancel',
        ),
      ),
    );
    const outcomeText = h('span');
    const outcome = h(
      'div',
      { class: 'outcome', hidden: true },
      outcomeText,
      h(
        'button',
        { type: 'button', class: 'link', on: { click: () => void set('pending') } },
        'Undo',
      ),
    );
    const actions = h(
      'div',
      { class: 'actions' },
      h('span', { class: 'ask' }, 'Replace with the value from your resume?'),
      h(
        'button',
        {
          type: 'button',
          class: 'primary yes',
          title: 'Replace with the resume value',
          on: { click: () => void set('replaced') },
        },
        'Yes',
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'no',
          title: 'Keep your current value',
          on: { click: () => void set('kept') },
        },
        'No',
      ),
      item.kind === 'file'
        ? null
        : h(
            'button',
            {
              type: 'button',
              class: 'edit',
              title: 'Edit the resume value before saving it',
              on: {
                click: () => {
                  actions.hidden = true;
                  editBox.hidden = false;
                  editor.focus();
                },
              },
            },
            'Edit',
          ),
    );
    const card = h(
      'article',
      { class: 'conflict', dataset: { state: 'pending' } },
      h('div', { class: 'conflict-label' }, item.label),
      h(
        'div',
        { class: 'compare' },
        h(
          'div',
          null,
          h('span', { class: 'tag' }, 'Current'),
          h('div', { class: 'val' }, item.current || '—'),
        ),
        h('div', null, h('span', { class: 'tag' }, 'From resume'), proposedEl),
      ),
      actions,
      editBox,
      outcome,
    );

    async function set(next: Decision, value?: string): Promise<void> {
      const prev = decisions[i]!;
      if (prev === next && next !== 'edited') return;
      if (prev === 'replaced' || prev === 'edited') await item.revert();
      if (next === 'replaced') await item.apply(item.proposed);
      if (next === 'edited') {
        await item.apply(value ?? item.proposed);
        proposedEl.textContent = value ?? item.proposed;
      }
      decisions[i] = next;
      card.dataset.state = next;
      editBox.hidden = true;
      actions.hidden = next !== 'pending';
      outcome.hidden = next === 'pending';
      if (next !== 'pending') outcomeText.textContent = OUTCOME_TEXT[next];
      updateRemaining();
    }
    setters.push(set);
    return card;
  });

  const bulk = async (d: Decision): Promise<void> => {
    for (let i = 0; i < items.length; i++) if (decisions[i] === 'pending') await setters[i]!(d);
  };

  const dialog = h(
    'dialog',
    { class: 'import-dialog', attrs: { 'aria-labelledby': 'import-dialog-title' } },
    h(
      'header',
      null,
      h('h2', { id: 'import-dialog-title' }, 'Review changes from your resume'),
      h(
        'p',
        { class: 'muted' },
        `${items.length} field${items.length === 1 ? '' : 's'} already had a value. Answer Yes to replace it, No to keep it, or Edit to adjust the resume's value first.`,
      ),
    ),
    h('div', { class: 'conflicts' }, ...cards),
    h(
      'footer',
      null,
      remaining,
      h(
        'button',
        { type: 'button', on: { click: () => void bulk('kept') } },
        'No to all remaining',
      ),
      h(
        'button',
        { type: 'button', on: { click: () => void bulk('replaced') } },
        'Yes to all remaining',
      ),
      h('button', { type: 'button', class: 'primary', on: { click: () => close() } }, 'Done'),
    ),
  );

  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    if (typeof dialog.close === 'function' && dialog.open) dialog.close();
    dialog.remove();
    onClose(decisions);
  };
  // Escape: treat unanswered fields as "No".
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    close();
  });

  updateRemaining();
  document.body.append(dialog);
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
  dialog.querySelector<HTMLButtonElement>('button.yes')?.focus();
  return dialog;
}

// ── Card in the profile editor ───────────────────────────────────────────────

export class ResumeImporter {
  readonly el: HTMLElement;
  private readonly status = h('div', { class: 'import-status', attrs: { role: 'status' } });
  private readonly actions = h('div', { class: 'data-actions' });

  constructor(private readonly host: ImportHost) {
    this.el = h(
      'div',
      { class: 'import-card' },
      h(
        'p',
        { class: 'muted' },
        'Upload your resume (PDF, Word .docx or plain text) to fill in your profile automatically. Empty fields are filled right away; for fields that already have a value you choose Yes, No or Edit. The file is read on this device only.',
      ),
      this.actions,
      this.status,
    );
    this.renderActions();
  }

  renderActions(): void {
    const picker = h('input', {
      type: 'file',
      accept:
        '.pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain',
      class: 'visually-hidden',
      id: 'resume-import-file',
    });
    picker.addEventListener('change', async () => {
      const file = picker.files?.[0];
      picker.value = '';
      if (!file) return;
      await this.run({
        bytes: new Uint8Array(await file.arrayBuffer()),
        name: file.name,
        type: file.type,
        fromSaved: false,
      });
    });
    const saved = this.host.documents().resume;
    clear(this.actions);
    append(this.actions, [
      h('label', { class: 'button primary', htmlFor: 'resume-import-file' }, 'Choose resume file…'),
      picker,
      saved && resumeKind(saved.name, saved.type)
        ? h(
            'button',
            { type: 'button', class: 'secondary', on: { click: () => void this.fromSaved() } },
            `Use saved resume (${saved.name})`,
          )
        : null,
    ]);
  }

  async fromSaved(): Promise<void> {
    const saved = this.host.documents().resume;
    if (!saved) return;
    this.el.closest('section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    await this.run({
      bytes: base64ToBytes(saved.data),
      name: saved.name,
      type: saved.type,
      fromSaved: true,
    });
  }

  private async run(source: ImportSource): Promise<void> {
    clear(this.status);
    this.status.className = 'import-status busy';
    this.status.append(`Reading ${source.name}…`);
    let result: ImportResult;
    try {
      result = await runImport(this.host, source);
    } catch (err) {
      clear(this.status);
      this.status.className = 'import-status error';
      this.status.append(err instanceof Error ? err.message : String(err));
      return;
    }
    this.renderActions();
    this.renderSummary(result, null);
    if (result.review.length) {
      openReviewDialog(result.review, (decisions) => {
        this.host.refresh();
        this.renderActions();
        this.renderSummary(result, decisions);
      });
    }
  }

  private renderSummary(result: ImportResult, decisions: Decision[] | null): void {
    clear(this.status);
    this.status.className = 'import-status done';
    const parts = [
      `Filled ${result.filled.length} empty field${result.filled.length === 1 ? '' : 's'}`,
    ];
    if (result.addedWork)
      parts.push(`added ${result.addedWork} job${result.addedWork === 1 ? '' : 's'}`);
    if (result.addedEducation) {
      parts.push(`added ${result.addedEducation} school${result.addedEducation === 1 ? '' : 's'}`);
    }
    this.status.append(h('strong', null, `${parts.join(', ')}.`));
    if (result.review.length) {
      if (decisions) {
        const count = (d: Decision): number => decisions.filter((x) => x === d).length;
        this.status.append(
          ` Of ${result.review.length} fields that already had a value: ${count('replaced')} replaced, ${count('edited')} edited, ${count('kept') + count('pending')} kept.`,
        );
      } else {
        this.status.append(
          ` ${result.review.length} fields already had a value — review them in the dialog.`,
        );
      }
    } else if (!result.filled.length) {
      this.status.append(' Your profile already matches this resume.');
    } else {
      this.status.append(' Nothing you had entered was changed.');
    }
    if (result.filled.length) {
      this.status.append(
        h(
          'details',
          null,
          h('summary', null, 'What was filled'),
          h(
            'ul',
            { class: 'filled-list' },
            ...result.filled.map((f) =>
              h('li', null, h('span', null, f.label), h('span', { class: 'muted' }, f.value)),
            ),
          ),
        ),
      );
    }
    this.status.append(
      h(
        'p',
        { class: 'muted small' },
        'Please review the sections below — resume layouts vary and parsing is best-effort.',
      ),
    );
  }
}
