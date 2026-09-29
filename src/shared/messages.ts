import type { TabReport } from './report';

/** Messages exchanged between the popup, content scripts and service worker. */
export type Message =
  /** Fill every frame of a tab. From the popup `tabId` is required; from a content script it is the sender's tab. */
  | { type: 'FILL_TAB'; tabId?: number }
  /** Re-run only the verification pass. */
  | { type: 'VERIFY_TAB'; tabId?: number }
  | { type: 'OPEN_OPTIONS'; hash?: string }
  /** A sub-frame found an application form; ask the top frame to show the button. */
  | { type: 'FRAME_HAS_FORM' }
  | { type: 'SHOW_BUTTON' }
  | { type: 'RUN_STARTED'; mode: 'fill' | 'verify' }
  | { type: 'SHOW_REPORT'; report: TabReport }
  | { type: 'SHOW_ERROR'; error: string }
  | { type: 'FOCUS_FIELD'; frameId: number; ref: number };

export type RunResponse = { ok: true; report: TabReport } | { ok: false; error: string };

export function sendMessage<R = unknown>(message: Message): Promise<R> {
  return chrome.runtime.sendMessage(message) as Promise<R>;
}
