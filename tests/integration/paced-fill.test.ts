/**
 * Human-like pacing on a full form: characters are typed one at a time with a
 * 0.1–0.9 s pause between them, and moving to another field waits 3–7 s.
 * Sleeps are recorded (not actually waited) so the test runs instantly.
 */
import { describe, expect, it } from 'vitest';
import { FillEngine } from '../../src/engine/engine';
import { RunAborted } from '../../src/engine/pacing';
import { DEFAULT_PACING } from '../../src/shared/defaults';
import type { RunProgress } from '../../src/shared/report';
import { byName, FAST_TIMING, loadDemo, sampleData } from '../helpers/fixtures';

type Event = { kind: 'sleep'; ms: number } | { kind: 'char'; field: string; value: string };

function pacedData() {
  return sampleData({ settings: { pacing: { ...DEFAULT_PACING } } });
}

describe('paced fill (type like a person)', () => {
  it('types every text field character by character, with 0.1–0.9 s between keys and 3–7 s between fields', async () => {
    loadDemo('lever-style.html');
    const timeline: Event[] = [];
    document
      .querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
        'input[type="text"], input[type="email"], textarea',
      )
      .forEach((el) => {
        el.addEventListener('input', () =>
          timeline.push({ kind: 'char', field: el.name, value: el.value }),
        );
      });
    const progress: RunProgress[] = [];
    const report = await new FillEngine(document, pacedData(), {
      timing: FAST_TIMING,
      sleep: async (ms) => void timeline.push({ kind: 'sleep', ms }),
      onProgress: (p) => progress.push(p),
    }).fill();

    // Same end result as an instant fill.
    expect(byName('name').value).toBe('Ada Lovelace');
    expect(byName('email').value).toBe('ada@example.com');
    expect(byName('urls[GitHub]').value).toBe('https://github.com/ada');

    // The name was built up one character at a time.
    const nameValues = timeline.flatMap((e) =>
      e.kind === 'char' && e.field === 'name' ? [e.value] : [],
    );
    expect(nameValues).toEqual(
      Array.from('Ada Lovelace', (_, i) => 'Ada Lovelace'.slice(0, i + 1)),
    );

    // Every recorded pause is either a keystroke pause or a between-field pause.
    const sleeps = timeline.flatMap((e) => (e.kind === 'sleep' ? [e.ms] : []));
    const keyPauses = sleeps.filter((ms) => ms < 1000);
    const fieldPauses = sleeps.filter((ms) => ms >= 1000);
    keyPauses.forEach((ms) => expect(ms).toBeGreaterThanOrEqual(100));
    keyPauses.forEach((ms) => expect(ms).toBeLessThanOrEqual(900));
    fieldPauses.forEach((ms) => expect(ms).toBeGreaterThanOrEqual(3000));
    fieldPauses.forEach((ms) => expect(ms).toBeLessThanOrEqual(7000));

    // One 3–7 s pause before each field except the first one touched.
    const touched = report.fields.filter((f) => f.status === 'filled').length;
    expect(fieldPauses).toHaveLength(touched - 1);

    // Between two consecutive characters: exactly one keystroke pause within a
    // field, and a 3–7 s pause whenever typing moves to a different field (one
    // per field in between, e.g. radio buttons or dropdowns that are clicked).
    let lastChar: Extract<Event, { kind: 'char' }> | null = null;
    let between: number[] = [];
    for (const e of timeline) {
      if (e.kind === 'sleep') {
        between.push(e.ms);
        continue;
      }
      if (lastChar) {
        if (lastChar.field === e.field) {
          expect(between).toHaveLength(1);
          expect(between[0]).toBeLessThanOrEqual(900);
        } else {
          expect(between.filter((ms) => ms >= 3000).length).toBeGreaterThanOrEqual(1);
        }
      }
      lastChar = e;
      between = [];
    }

    // Progress was reported for the panel.
    expect(progress.length).toBeGreaterThan(touched);
    expect(progress.some((p) => p.phase === 'waiting' && p.label === 'Email')).toBe(true);
    expect(progress.some((p) => p.phase === 'typing' && p.label === 'Full name')).toBe(true);
    const actionOf = (label: string) => progress.find((p) => p.label === label)?.action;
    expect(actionOf('Resume/CV')).toBe('upload');
    expect(actionOf('Full name')).toBe('type');
    expect(actionOf('Gender')).toBe('choose');
    const last = progress[progress.length - 1]!;
    expect(last.step).toBe(touched);
    expect(last.total).toBeGreaterThanOrEqual(last.step);
    expect(progress[0]!.etaMs).toBeGreaterThan(0);
  });

  it('types search text into dropdowns and pauses before Workday-style menus', async () => {
    loadDemo('greenhouse-style.html');
    const searches: string[] = [];
    document
      .getElementById('candidate-location')!
      .addEventListener('input', (e) => searches.push((e.target as HTMLInputElement).value));
    await new FillEngine(document, pacedData(), {
      timing: FAST_TIMING,
      sleep: async () => undefined,
    }).fill();
    const box = document.getElementById('candidate-location')!.closest('.demo-combo')!;
    expect(box.querySelector<HTMLInputElement>('input[type="hidden"]')!.value).toBe(
      'San Francisco, California, United States',
    );
    // "San Francisco, CA" typed key by key into the typeahead.
    expect(searches.slice(0, 3)).toEqual(['S', 'Sa', 'San']);
  });

  it('Stop finishes the current field, leaves the rest, and still reports what is empty', async () => {
    loadDemo('lever-style.html');
    const controller = new AbortController();
    let calls = 0;
    const report = await new FillEngine(document, pacedData(), {
      timing: FAST_TIMING,
      signal: controller.signal,
      // Resume (no pause) → name: 1 field pause + 11 key pauses → email: field pause, 'a',
      // key pause, 'd', key pause → Stop.
      sleep: async (_ms, signal) => {
        if (++calls === 15) controller.abort();
        if (signal?.aborted) throw new RunAborted();
      },
    }).fill();

    expect(report.stopped).toBe(true);
    expect(byName('name').value).toBe('Ada Lovelace');
    expect(byName('email').value).toBe('ada@example.com'); // completed, not half-typed
    expect(byName('phone').value).toBe('');
    expect(report.fields.find((f) => f.label === 'Email')?.status).toBe('filled');
    expect(report.missing.map((m) => m.label)).toContain('Phone');
  });
});
