/**
 * Service worker: starts runs in every frame of a tab, relays progress and
 * per-frame reports to the top frame, broadcasts Stop, and records the
 * application log.
 *
 * Runs are event-driven on purpose: a paced fill (typing one character at a
 * time) can take many minutes, and Chrome terminates a service worker that
 * spends more than 5 minutes on a single call. Every handler here returns in
 * milliseconds; the run itself lives in the page's content script.
 */
import { isProfileEmpty } from '../shared/completeness';
import { newId } from '../shared/defaults';
import type { Message, RunMode, RunResponse, StartResult } from '../shared/messages';
import { Store } from '../shared/storage';

const store = new Store();

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === chrome.runtime.OnInstalledReason.INSTALL) {
    void chrome.runtime.openOptionsPage();
  }
});

function toTop(tabId: number, message: Message): void {
  chrome.tabs.sendMessage(tabId, message, { frameId: 0 }).catch(() => undefined);
}

/** Runs inside each frame via chrome.scripting — must be self-contained. */
function startInFrame(mode: RunMode, runId: string): StartResult | 'missing' {
  const api = (globalThis as { __jobfill?: { start(m: RunMode, id: string): StartResult } })
    .__jobfill;
  return api ? api.start(mode, runId) : 'missing';
}

/** Inject the content script into frames that loaded before the extension did. */
async function ensureInjected(tabId: number): Promise<void> {
  const probes = await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    func: () => !!(globalThis as { __jobfill?: unknown }).__jobfill,
  });
  const missing = probes.filter((p) => !p.result).map((p) => p.frameId);
  if (missing.length) {
    await chrome.scripting.executeScript({
      target: { tabId, frameIds: missing },
      files: ['content.js'],
    });
  }
}

function friendlyError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (
    /cannot access|cannot be scripted|chrome:\/\/|extensions gallery|Missing host permission/i.test(
      msg,
    )
  ) {
    return 'JobFill cannot run on this page (browser pages and the Chrome Web Store are off limits).';
  }
  return msg;
}

const BUSY_MESSAGE =
  'JobFill is already filling this page. Press Stop in the JobFill panel to start over.';

async function runOnTab(tabId: number, mode: RunMode): Promise<RunResponse> {
  const runId = newId();
  try {
    await ensureInjected(tabId);
    const results = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: startInFrame,
      args: [mode, runId],
    });
    const frameIds = results.filter((r) => r.result === 'started').map((r) => r.frameId);
    // A run is still going: leave it (and its panel) alone.
    if (!frameIds.length && results.some((r) => r.result === 'busy')) {
      return { ok: false, error: BUSY_MESSAGE };
    }
    const profileEmpty = isProfileEmpty(await store.loadProfile());
    toTop(tabId, { type: 'RUN_STARTED', runId, mode, frameIds, profileEmpty });
    return { ok: true, started: frameIds.length };
  } catch (err) {
    const error = friendlyError(err);
    toTop(tabId, { type: 'SHOW_ERROR', error });
    return { ok: false, error };
  }
}

async function recordHistory(report: Extract<Message, { type: 'RUN_COMPLETE' }>['report']) {
  const settings = await store.loadSettings();
  if (report.mode !== 'fill' || !settings.keepHistory || report.noForm || !report.url) return;
  let host = '';
  try {
    host = new URL(report.url).hostname;
  } catch {
    /* keep empty */
  }
  await store.addHistory({
    url: report.url,
    host,
    title: report.title,
    ats: report.ats,
    filled: report.filledCount,
    requiredMissing: report.requiredMissing,
    optionalMissing: report.optionalMissing,
  });
}

chrome.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
  const senderTab = sender.tab?.id;
  switch (message.type) {
    case 'FILL_TAB':
    case 'VERIFY_TAB': {
      const tabId = message.tabId ?? senderTab;
      if (tabId === undefined) {
        sendResponse({ ok: false, error: 'No tab to fill.' } satisfies RunResponse);
        return false;
      }
      void runOnTab(tabId, message.type === 'FILL_TAB' ? 'fill' : 'verify').then(sendResponse);
      return true;
    }
    case 'STOP_TAB': {
      const tabId = message.tabId ?? senderTab;
      if (tabId !== undefined) {
        chrome.tabs
          .sendMessage(tabId, { type: 'STOP_RUN' } satisfies Message)
          .catch(() => undefined);
      }
      return false;
    }
    case 'FRAME_PROGRESS':
      if (senderTab !== undefined) {
        toTop(senderTab, {
          type: 'RUN_PROGRESS',
          runId: message.runId,
          frameId: sender.frameId ?? 0,
          progress: message.progress,
        });
      }
      return false;
    case 'FRAME_DONE':
      if (senderTab !== undefined) {
        toTop(senderTab, {
          type: 'FRAME_REPORT',
          runId: message.runId,
          frameId: sender.frameId ?? 0,
          report: message.report,
        });
      }
      return false;
    case 'RUN_COMPLETE':
      void recordHistory(message.report);
      return false;
    case 'OPEN_OPTIONS': {
      const url = chrome.runtime.getURL(`options.html${message.hash ? `#${message.hash}` : ''}`);
      void chrome.tabs.create({ url });
      return false;
    }
    case 'FRAME_HAS_FORM':
      if (senderTab !== undefined && sender.frameId !== 0)
        toTop(senderTab, { type: 'SHOW_BUTTON' });
      return false;
    case 'FOCUS_FIELD':
      if (senderTab !== undefined) {
        chrome.tabs
          .sendMessage(senderTab, message, { frameId: message.frameId })
          .catch(() => undefined);
      }
      return false;
    default:
      return false;
  }
});

chrome.commands.onCommand.addListener((command) => {
  if (command !== 'autofill') return;
  void chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
    if (tab?.id !== undefined) void runOnTab(tab.id, 'fill');
  });
});
