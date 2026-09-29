/**
 * Service worker: coordinates fills across every frame of a tab, merges the
 * per-frame reports, relays UI messages and records the application log.
 */
import { isProfileEmpty } from '../shared/completeness';
import type { Message, RunResponse } from '../shared/messages';
import { mergeFrameReports, type FrameReport, type TabReport } from '../shared/report';
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
function runInFrame(mode: 'fill' | 'verify'): Promise<unknown> | null {
  const api = (globalThis as { __jobfill?: { run(m: string): Promise<unknown> } }).__jobfill;
  return api ? api.run(mode) : null;
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

async function runOnTab(tabId: number, mode: 'fill' | 'verify'): Promise<RunResponse> {
  toTop(tabId, { type: 'RUN_STARTED', mode });
  try {
    await ensureInjected(tabId);
    const results = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: runInFrame,
      args: [mode],
    });
    const [profile, settings] = await Promise.all([store.loadProfile(), store.loadSettings()]);
    const report: TabReport = mergeFrameReports(
      mode,
      results.map((r) => ({
        frameId: r.frameId,
        report: (r.result ?? null) as FrameReport | null,
      })),
      isProfileEmpty(profile),
    );
    toTop(tabId, { type: 'SHOW_REPORT', report });

    if (mode === 'fill' && settings.keepHistory && !report.noForm && report.url) {
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
    return { ok: true, report };
  } catch (err) {
    const error = friendlyError(err);
    toTop(tabId, { type: 'SHOW_ERROR', error });
    return { ok: false, error };
  }
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
