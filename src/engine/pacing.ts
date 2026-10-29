/**
 * Human-like pacing: a random pause between keystrokes and a longer random
 * pause before moving to the next field. Also the single place where a run
 * notices that the user pressed Stop.
 */
import type { PacingSettings } from '../shared/types';

/** Thrown out of the fill when the user stops the run. */
export class RunAborted extends Error {
  constructor() {
    super('Stopped by the user');
    this.name = 'RunAborted';
  }
}

export type Sleeper = (ms: number, signal?: AbortSignal) => Promise<void>;

export const abortableSleep: Sleeper = (ms, signal) =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new RunAborted());
      return;
    }
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(new RunAborted());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });

export interface PacerHooks {
  /** Source of randomness in [0, 1) — injectable for tests. */
  random?: () => number;
  sleep?: Sleeper;
  signal?: AbortSignal;
  /** Typing waits while this document's tab is in the background. */
  doc?: Document;
  /** A pause of `ms` is about to happen before the next field. */
  onPause?(ms: number): void;
  /** The pacer let the next field start. */
  onFieldStart?(): void;
  /** Typing paused because the tab went to the background (true) or resumed (false). */
  onVisibility?(hidden: boolean): void;
}

export class Pacer {
  private started = false;

  constructor(
    readonly settings: PacingSettings,
    private readonly hooks: PacerHooks = {},
  ) {}

  get enabled(): boolean {
    return this.settings.enabled;
  }

  /** Throw if the user pressed Stop. */
  checkpoint(): void {
    if (this.hooks.signal?.aborted) throw new RunAborted();
  }

  private draw(minSec: number, maxSec: number): number {
    const r = (this.hooks.random ?? Math.random)();
    return Math.round((minSec + r * (maxSec - minSec)) * 1000);
  }

  private async wait(ms: number): Promise<void> {
    this.checkpoint();
    if (ms > 0) await (this.hooks.sleep ?? abortableSleep)(ms, this.hooks.signal);
    await this.whenVisible();
    this.checkpoint();
  }

  /** Pause between two keystrokes (or two small steps inside one field). */
  async key(): Promise<void> {
    if (!this.enabled) return this.checkpoint();
    await this.wait(this.draw(this.settings.keyMinSec, this.settings.keyMaxSec));
  }

  /** Pause before moving to another field — none before the first one. */
  async field(): Promise<void> {
    this.checkpoint();
    if (this.enabled && this.started) {
      const ms = this.draw(this.settings.fieldMinSec, this.settings.fieldMaxSec);
      this.hooks.onPause?.(ms);
      await this.wait(ms);
    }
    this.started = true;
    this.hooks.onFieldStart?.();
  }

  /** Expected duration of typing `chars` characters across `fields` fields. */
  estimateMs(chars: number, fields: number): number {
    if (!this.enabled) return 0;
    const s = this.settings;
    const key = ((s.keyMinSec + s.keyMaxSec) / 2) * 1000;
    const field = ((s.fieldMinSec + s.fieldMaxSec) / 2) * 1000;
    return Math.round(chars * key + Math.max(0, fields - 1) * field);
  }

  /**
   * Background tabs get their timers throttled (down to once a minute), so a
   * paced run waits for the tab to be visible again instead of crawling.
   */
  private async whenVisible(): Promise<void> {
    const doc = this.hooks.doc;
    if (!this.enabled || !doc || doc.visibilityState !== 'hidden') return;
    this.hooks.onVisibility?.(true);
    await new Promise<void>((resolve, reject) => {
      const signal = this.hooks.signal;
      const done = (): void => {
        doc.removeEventListener('visibilitychange', onChange);
        signal?.removeEventListener('abort', onAbort);
      };
      const onChange = (): void => {
        if (doc.visibilityState === 'hidden') return;
        done();
        resolve();
      };
      const onAbort = (): void => {
        done();
        reject(new RunAborted());
      };
      doc.addEventListener('visibilitychange', onChange);
      signal?.addEventListener('abort', onAbort, { once: true });
    });
    this.hooks.onVisibility?.(false);
  }
}
