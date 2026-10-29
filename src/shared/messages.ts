import type { FrameReport, RunProgress, TabReport } from './report';

export type RunMode = 'fill' | 'verify';

/**
 * Messages exchanged between the popup, content scripts and service worker.
 *
 * A run is event-driven (a paced fill can take far longer than Chrome lets a
 * service worker wait on one call): the worker starts the run in every frame,
 * frames report progress and results by message, and the top frame's
 * coordinator merges them and shows the report.
 */
export type Message =
  /** Fill every frame of a tab. From the popup `tabId` is required; from a content script it is the sender's tab. */
  | { type: 'FILL_TAB'; tabId?: number }
  /** Re-run only the verification pass. */
  | { type: 'VERIFY_TAB'; tabId?: number }
  /** Stop the run in progress on a tab. */
  | { type: 'STOP_TAB'; tabId?: number }
  | { type: 'OPEN_OPTIONS'; hash?: string }
  /** A sub-frame found an application form; ask the top frame to show the button. */
  | { type: 'FRAME_HAS_FORM' }
  | { type: 'SHOW_BUTTON' }
  /** Worker → top frame: a run started in these frames (none → no form on the page). */
  | { type: 'RUN_STARTED'; runId: string; mode: RunMode; frameIds: number[]; profileEmpty: boolean }
  /** Frame → worker, relayed to the top frame as RUN_PROGRESS. */
  | { type: 'FRAME_PROGRESS'; runId: string; progress: RunProgress }
  | { type: 'RUN_PROGRESS'; runId: string; frameId: number; progress: RunProgress }
  /** Frame → worker, relayed to the top frame as FRAME_REPORT. */
  | { type: 'FRAME_DONE'; runId: string; report: FrameReport }
  | { type: 'FRAME_REPORT'; runId: string; frameId: number; report: FrameReport }
  /** Top frame → worker once every frame reported (recorded in the application log). */
  | { type: 'RUN_COMPLETE'; report: TabReport }
  /** Worker → every frame. */
  | { type: 'STOP_RUN' }
  | { type: 'SHOW_ERROR'; error: string }
  | { type: 'FOCUS_FIELD'; frameId: number; ref: number };

/** Reply to FILL_TAB / VERIFY_TAB: how many frames started (results arrive on the page). */
export type RunResponse = { ok: true; started: number } | { ok: false; error: string };

/** What a frame says when asked to start a run. */
export type StartResult = 'started' | 'busy' | 'no-form';

export function sendMessage<R = unknown>(message: Message): Promise<R> {
  return chrome.runtime.sendMessage(message) as Promise<R>;
}
