import { describe, expect, it, vi } from 'vitest';
import { abortableSleep, Pacer, RunAborted } from '../../src/engine/pacing';
import { DEFAULT_PACING, normalizeSettings } from '../../src/shared/defaults';

/** A pacer whose sleeps are recorded instead of waited for. */
function recordingPacer(random: () => number = Math.random, settings = DEFAULT_PACING) {
  const sleeps: number[] = [];
  const pacer = new Pacer(
    { ...settings },
    {
      random,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    },
  );
  return { pacer, sleeps };
}

describe('Pacer', () => {
  it('defaults to 0.1–0.9 s between keystrokes and 3–7 s between fields', () => {
    expect(DEFAULT_PACING).toEqual({
      enabled: true,
      keyMinSec: 0.1,
      keyMaxSec: 0.9,
      fieldMinSec: 3,
      fieldMaxSec: 7,
    });
  });

  it('draws keystroke delays uniformly from the configured range', async () => {
    const values = [0, 0.25, 0.5, 0.999];
    const { pacer, sleeps } = recordingPacer(() => values.shift()!);
    for (let i = 0; i < 4; i++) await pacer.key();
    expect(sleeps).toEqual([100, 300, 500, 899]);
  });

  it('pauses 3–7 s before every field except the first', async () => {
    const onPause = vi.fn();
    const onFieldStart = vi.fn();
    const sleeps: number[] = [];
    const values = [0, 0.5, 0.999];
    const pacer = new Pacer(
      { ...DEFAULT_PACING },
      {
        random: () => values.shift()!,
        sleep: async (ms) => void sleeps.push(ms),
        onPause,
        onFieldStart,
      },
    );
    for (let i = 0; i < 4; i++) await pacer.field();
    expect(sleeps).toEqual([3000, 5000, 6996]);
    expect(onPause.mock.calls.map((c) => c[0])).toEqual([3000, 5000, 6996]);
    expect(onFieldStart).toHaveBeenCalledTimes(4);
  });

  it('keeps every random delay inside its range', async () => {
    const { pacer, sleeps } = recordingPacer();
    await pacer.field();
    for (let i = 0; i < 200; i++) await pacer.key();
    expect(Math.min(...sleeps)).toBeGreaterThanOrEqual(100);
    expect(Math.max(...sleeps)).toBeLessThanOrEqual(900);
    sleeps.length = 0;
    for (let i = 0; i < 200; i++) await pacer.field();
    expect(Math.min(...sleeps)).toBeGreaterThanOrEqual(3000);
    expect(Math.max(...sleeps)).toBeLessThanOrEqual(7000);
  });

  it('never waits when pacing is off', async () => {
    const { pacer, sleeps } = recordingPacer(Math.random, { ...DEFAULT_PACING, enabled: false });
    await pacer.field();
    await pacer.field();
    await pacer.key();
    expect(sleeps).toEqual([]);
    expect(pacer.estimateMs(100, 10)).toBe(0);
  });

  it('estimates the run length from the average delays', () => {
    const { pacer } = recordingPacer();
    // 100 characters × 0.5 s + 9 pauses × 5 s
    expect(pacer.estimateMs(100, 10)).toBe(95_000);
  });

  it('stops promptly when aborted, even in the middle of a pause', async () => {
    const controller = new AbortController();
    const pacer = new Pacer(
      { ...DEFAULT_PACING, fieldMinSec: 60, fieldMaxSec: 60 },
      { signal: controller.signal },
    );
    await pacer.field(); // first field: no pause
    const pending = pacer.field();
    setTimeout(() => controller.abort(), 10);
    await expect(pending).rejects.toBeInstanceOf(RunAborted);
    expect(() => pacer.checkpoint()).toThrow(RunAborted);
  });

  it('abortableSleep resolves after the delay', async () => {
    const start = Date.now();
    await abortableSleep(20);
    expect(Date.now() - start).toBeGreaterThanOrEqual(15);
  });

  it('waits while the tab is in the background', async () => {
    const doc = Object.assign(new EventTarget(), { visibilityState: 'hidden' });
    const onVisibility = vi.fn();
    const pacer = new Pacer(
      { ...DEFAULT_PACING },
      { doc: doc as unknown as Document, sleep: async () => undefined, onVisibility },
    );
    let done = false;
    const typing = pacer.key().then(() => (done = true));
    await new Promise((r) => setTimeout(r, 20));
    expect(done).toBe(false);
    expect(onVisibility).toHaveBeenCalledWith(true);
    doc.visibilityState = 'visible';
    doc.dispatchEvent(new Event('visibilitychange'));
    await typing;
    expect(done).toBe(true);
    expect(onVisibility).toHaveBeenLastCalledWith(false);
  });
});

describe('pacing settings', () => {
  it('loads defaults for older saved settings and repairs bad values', () => {
    expect(normalizeSettings({}).pacing).toEqual(DEFAULT_PACING);
    expect(
      normalizeSettings({
        pacing: { enabled: true, keyMinSec: 2, keyMaxSec: 0.5, fieldMinSec: -4, fieldMaxSec: 999 },
      }).pacing,
    ).toEqual({ enabled: true, keyMinSec: 0.5, keyMaxSec: 2, fieldMinSec: 0, fieldMaxSec: 120 });
  });

  it('never hands out the shared defaults object', () => {
    const settings = normalizeSettings({});
    settings.pacing.enabled = false;
    expect(DEFAULT_PACING.enabled).toBe(true);
  });
});
