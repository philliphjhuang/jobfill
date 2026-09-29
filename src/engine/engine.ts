/**
 * Orchestrates one auto-fill run inside a single frame:
 *   1. scan + classify   2. upload resume first (many ATSs parse it)
 *   3. add missing work/education slots   4. fill   5. fill fields that
 *   appeared as a result   6. verify every field and flag what is empty.
 */
import type { FieldReport, FrameReport, MissingItem } from '../shared/report';
import type { StoredData } from '../shared/types';
import { detectAts, type AtsAdapter } from './ats';
import { classifyAll } from './classifier';
import { closestDeep, focusQuietly, scrollIntoView, waitForDomSettled } from './dom';
import { assignEntryIndices, ensureEntries } from './entries';
import { fillField, type FillOutcome } from './fillers';
import { clearHighlights, flash, highlight, highlightTarget } from './highlight';
import { EEO_TYPES, type ClassifiedField, type FieldType } from './model';
import { resolveValue } from './resolver';
import { scanFields } from './scanner';
import { readValue } from './values';

export interface EngineTiming {
  /** Quiet period that counts as "the page finished reacting". */
  settleQuietMs: number;
  settleMaxMs: number;
  /** Resume parsing can take a while on Workday/Lever. */
  uploadQuietMs: number;
  uploadMaxMs: number;
  comboboxTimeoutMs: number;
}

export const DEFAULT_TIMING: EngineTiming = {
  settleQuietMs: 400,
  settleMaxMs: 2500,
  uploadQuietMs: 1200,
  uploadMaxMs: 8000,
  comboboxTimeoutMs: 1500,
};

const IDENTITY_TYPES = new Set<FieldType>([
  'firstName',
  'lastName',
  'fullName',
  'email',
  'phone',
  'resume',
  'linkedin',
  'location',
  'address1',
]);

/** Keep only fields that belong to the application form(s), not newsletter boxes etc. */
export function scopeToApplication(fields: ClassifiedField[]): ClassifiedField[] {
  const counts = new Map<Element | null, number>();
  for (const f of fields) {
    const form = closestDeep(f.el, 'form');
    counts.set(form, (counts.get(form) ?? 0) + (f.classification ? 1 : 0));
  }
  const goodForms = [...counts].filter(([form, n]) => form && n >= 2).map(([form]) => form);
  if (!goodForms.length) return fields;
  const keepFormless = (counts.get(null) ?? 0) >= 2;
  return fields.filter((f) => {
    const form = closestDeep(f.el, 'form');
    return form ? goodForms.includes(form) : keepFormless;
  });
}

/** Enough recognizable fields to be worth auto-filling (or showing the button). */
export function looksLikeApplication(fields: ClassifiedField[], strict = false): boolean {
  const types = new Set(fields.map((f) => f.classification?.type).filter(Boolean) as FieldType[]);
  const identity = [...types].filter((t) => IDENTITY_TYPES.has(t)).length;
  if (types.has('resume') && identity >= 2) return true;
  return strict ? identity >= 3 : types.size >= 2;
}

function fallbackLabel(field: ClassifiedField): string {
  if (field.label) return field.label;
  const hint = field.el.getAttribute('placeholder') || field.el.getAttribute('name') || field.attrs;
  return hint ? hint : `Unlabeled ${field.kind} field`;
}

export class FillEngine {
  private outcomes = new Map<Element, FieldReport>();
  private flagged: HTMLElement[] = [];
  private readonly adapter: AtsAdapter | null;

  constructor(
    private readonly doc: Document,
    private readonly data: StoredData,
    private readonly timing: EngineTiming = DEFAULT_TIMING,
  ) {
    this.adapter = detectAts(doc.location?.hostname ?? '');
  }

  scan(): ClassifiedField[] {
    const fields = classifyAll(scanFields(this.doc.body ?? this.doc), {
      customAnswers: this.data.profile.customAnswers,
      hints: this.adapter?.hints,
    });
    assignEntryIndices(fields);
    return scopeToApplication(fields);
  }

  private record(field: ClassifiedField, outcome: FillOutcome): void {
    this.outcomes.set(field.el, {
      label: fallbackLabel(field),
      kind: field.kind,
      type: field.classification?.type ?? null,
      status: outcome.status,
      required: field.required,
      detail: outcome.detail,
    });
  }

  private async fillOne(field: ClassifiedField, state: { resumeDone: boolean }): Promise<void> {
    const { settings } = this.data;
    const c = field.classification;
    if (field.readOnly) return;
    if (!c) {
      this.record(field, { status: 'unrecognized' });
      return;
    }
    if (EEO_TYPES.has(c.type) && !settings.fillEeo) {
      this.record(field, { status: 'skipped', detail: 'Voluntary questions are turned off' });
      return;
    }
    if (field.kind === 'file') {
      if (c.type === 'resume' && (!settings.uploadResume || state.resumeDone)) {
        this.record(field, { status: 'skipped', detail: 'Resume upload is off or already done' });
        return;
      }
      if (c.type === 'coverLetter' && !settings.uploadCoverLetter) {
        this.record(field, { status: 'skipped', detail: 'Cover letter upload is off' });
        return;
      }
    }
    const resolved = resolveValue(field, this.data);
    if (!resolved) {
      this.record(field, { status: readValue(field) ? 'already-filled' : 'no-data' });
      return;
    }
    if (resolved.skipReason) {
      this.record(field, { status: 'skipped', detail: resolved.skipReason });
      return;
    }
    try {
      const outcome = await fillField(field, resolved, {
        overwrite: settings.overwriteExisting,
        comboboxTimeoutMs: this.timing.comboboxTimeoutMs,
      });
      if (c.type === 'resume' && outcome.status === 'filled') state.resumeDone = true;
      this.record(field, outcome);
    } catch (err) {
      this.record(field, {
        status: 'failed',
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private settle(quiet = this.timing.settleQuietMs, max = this.timing.settleMaxMs): Promise<void> {
    return waitForDomSettled(this.doc.body, quiet, max);
  }

  async fill(): Promise<FrameReport> {
    const started = Date.now();
    clearHighlights(this.doc);
    this.outcomes.clear();
    const state = { resumeDone: false };

    let fields = this.scan();
    if (!looksLikeApplication(fields)) return this.report(started, [], false);

    // 1. Resume first: Workday, Lever, Greenhouse and Ashby parse it and pre-fill fields.
    const resumeField = fields.find(
      (f) => f.kind === 'file' && f.classification?.type === 'resume',
    );
    if (resumeField) {
      await this.fillOne(resumeField, state);
      if (state.resumeDone) {
        await this.settle(this.timing.uploadQuietMs, this.timing.uploadMaxMs);
        fields = this.scan();
      }
    }

    // 2. Make room for every work/education entry.
    if (this.data.settings.addMissingEntries) {
      const changed = await ensureEntries(
        this.doc,
        () => this.scan(),
        { work: this.data.profile.work.length, education: this.data.profile.education.length },
        { quietMs: this.timing.settleQuietMs, maxMs: this.timing.settleMaxMs },
      );
      if (changed) fields = this.scan();
    }

    // 3. Main pass in page order (country before state, etc.).
    for (const field of fields) {
      if (this.outcomes.has(field.el)) continue;
      await this.fillOne(field, state);
    }

    // 4. Conditional questions revealed by earlier answers.
    await this.settle();
    fields = this.scan();
    for (const field of fields) {
      if (this.outcomes.has(field.el)) continue;
      await this.fillOne(field, state);
    }

    return this.report(started, this.scan(), true);
  }

  async verify(): Promise<FrameReport> {
    const started = Date.now();
    clearHighlights(this.doc);
    const fields = this.scan();
    if (!looksLikeApplication(fields)) return this.report(started, [], false);
    return this.report(started, fields, true);
  }

  /** Verification: re-read every field from the DOM and flag what is still empty. */
  private report(
    started: number,
    fields: ClassifiedField[],
    highlightFields: boolean,
  ): FrameReport {
    this.flagged = [];
    const missing: MissingItem[] = [];
    const reports: FieldReport[] = [];
    const doHighlight = highlightFields && this.data.settings.highlightFields;

    for (const field of fields) {
      const value = readValue(field);
      const outcome = this.outcomes.get(field.el);
      const base: FieldReport = outcome ?? {
        label: fallbackLabel(field),
        kind: field.kind,
        type: field.classification?.type ?? null,
        status: value ? 'already-filled' : field.classification ? 'no-data' : 'unrecognized',
        required: field.required,
      };
      reports.push(base);

      if (value) {
        if (doHighlight && outcome?.status === 'filled')
          highlight(highlightTarget(field), 'filled');
        continue;
      }
      // Optional single checkboxes (newsletter, "text me") are fine unchecked.
      if (field.kind === 'checkbox' && !field.required) continue;
      if (base.status === 'skipped' && !field.required) continue;
      const ref = this.flagged.push(highlightTarget(field)) - 1;
      missing.push({
        ref,
        label: fallbackLabel(field),
        kind: field.kind,
        required: field.required,
      });
      if (doHighlight) highlight(this.flagged[ref]!, field.required ? 'required' : 'optional');
    }

    const win = this.doc.defaultView;
    return {
      url: this.doc.location?.href ?? '',
      title: this.doc.title,
      isTop: !!win && win === win.top,
      ats: this.adapter?.name ?? null,
      fields: reports,
      missing,
      durationMs: Date.now() - started,
    };
  }

  focus(ref: number): boolean {
    const el = this.flagged[ref];
    if (!el || !el.isConnected) return false;
    scrollIntoView(el);
    const control = el.matches('input, select, textarea, button')
      ? el
      : el.querySelector<HTMLElement>('input:not([type="hidden"]), select, textarea, button');
    if (control) focusQuietly(control);
    flash(el);
    return true;
  }
}
