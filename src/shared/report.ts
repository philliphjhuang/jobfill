/**
 * Serializable fill/verification results. Frame reports are produced by the
 * content-script engine in every frame and merged by the service worker.
 */

export type FillStatus =
  'filled' | 'already-filled' | 'no-data' | 'no-match' | 'failed' | 'skipped' | 'unrecognized';

export type ControlKind =
  | 'text'
  | 'textarea'
  | 'select'
  | 'radio'
  | 'checkbox'
  | 'checkbox-group'
  | 'file'
  | 'combobox'
  | 'date';

export interface FieldReport {
  label: string;
  kind: ControlKind;
  /** Classified field type, or null when the field was not recognized. */
  type: string | null;
  status: FillStatus;
  required: boolean;
  detail?: string;
}

export interface MissingItem {
  /** Index into the frame's list of flagged elements, used to scroll to it. */
  ref: number;
  label: string;
  kind: ControlKind;
  required: boolean;
}

export interface FrameReport {
  url: string;
  title: string;
  isTop: boolean;
  ats: string | null;
  fields: FieldReport[];
  missing: MissingItem[];
  durationMs: number;
  error?: string;
}

export interface TabFieldReport extends FieldReport {
  frameId: number;
}

export interface TabMissingItem extends MissingItem {
  frameId: number;
}

export interface TabReport {
  mode: 'fill' | 'verify';
  url: string;
  title: string;
  ats: string | null;
  fields: TabFieldReport[];
  missing: TabMissingItem[];
  filledCount: number;
  requiredMissing: number;
  optionalMissing: number;
  durationMs: number;
  errors: string[];
  /** True when no frame contained anything that looked like a form. */
  noForm: boolean;
  profileEmpty: boolean;
}

export function mergeFrameReports(
  mode: 'fill' | 'verify',
  frames: Array<{ frameId: number; report: FrameReport | null | undefined }>,
  profileEmpty = false,
): TabReport {
  const top = frames.find((f) => f.report?.isTop)?.report ?? frames[0]?.report ?? null;
  const fields: TabFieldReport[] = [];
  const missing: TabMissingItem[] = [];
  const errors: string[] = [];
  let ats: string | null = top?.ats ?? null;
  let durationMs = 0;

  for (const { frameId, report } of frames) {
    if (!report) continue;
    if (report.error) errors.push(report.error);
    if (!ats && report.ats) ats = report.ats;
    durationMs = Math.max(durationMs, report.durationMs);
    for (const f of report.fields) fields.push({ ...f, frameId });
    for (const m of report.missing) missing.push({ ...m, frameId });
  }

  // Required items first, then keep page order.
  missing.sort((a, b) => Number(b.required) - Number(a.required));

  return {
    mode,
    url: top?.url ?? '',
    title: top?.title ?? '',
    ats,
    fields,
    missing,
    filledCount: fields.filter((f) => f.status === 'filled').length,
    requiredMissing: missing.filter((m) => m.required).length,
    optionalMissing: missing.filter((m) => !m.required).length,
    durationMs,
    errors,
    noForm: fields.length === 0 && missing.length === 0,
    profileEmpty,
  };
}
