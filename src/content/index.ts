/**
 * Content script: runs in every frame. Exposes `__jobfill.start()` for the
 * service worker (which calls it in all frames via chrome.scripting); a run
 * then reports progress and its result by message. In the top frame it also
 * shows the floating button and results panel, and assembles the frames'
 * reports into one result.
 */
import { findEmbeddedAts, detectAts } from '../engine/ats';
import { classifyAll } from '../engine/classifier';
import { FillEngine, looksLikeApplication, scopeToApplication } from '../engine/engine';
import { scanFields } from '../engine/scanner';
import type { Message, RunMode, StartResult } from '../shared/messages';
import type { FrameReport } from '../shared/report';
import { Store } from '../shared/storage';
import { RunCoordinator } from './coordinator';
import { Panel } from './panel';

interface JobfillApi {
  /** Begin a run in this frame without waiting for it (a paced fill takes minutes). */
  start(mode: RunMode, runId: string): StartResult;
  /** Stop this frame's run; it finishes the current field and reports. */
  stop(): void;
  focus(ref: number): boolean;
}

declare global {
  var __jobfill: JobfillApi | undefined;
}

const isTop = window === window.top;

function send(message: Message): Promise<unknown> {
  return chrome.runtime.sendMessage(message).catch(() => undefined);
}

const knownAts = !!detectAts(location.hostname);

function pageHasApplication(strict: boolean): boolean {
  if (!document.body) return false;
  // Cheap pre-check so ordinary pages never pay for a full scan. Known ATS
  // hosts skip it because some render their forms inside shadow roots.
  if (
    !knownAts &&
    document.querySelectorAll('input:not([type="hidden"]), select, textarea').length < 2
  ) {
    return false;
  }
  const fields = scopeToApplication(
    classifyAll(scanFields(document.body), { hints: detectAts(location.hostname)?.hints }),
  );
  return looksLikeApplication(fields, strict);
}

function emptyReport(error?: string): FrameReport {
  return {
    url: location.href,
    title: document.title,
    isTop,
    ats: null,
    fields: [],
    missing: [],
    durationMs: 0,
    ...(error ? { error } : {}),
  };
}

function init(): void {
  const store = new Store();
  let engine: FillEngine | null = null;
  let active: AbortController | null = null;

  const api: JobfillApi = {
    start(mode, runId) {
      if (active) return 'busy';
      // Ad/embed frames: skip without loading the profile and resume into memory.
      if (!pageHasApplication(false)) return 'no-form';
      const controller = new AbortController();
      active = controller;
      void (async () => {
        let report: FrameReport;
        try {
          const data = await store.loadAll();
          engine = new FillEngine(document, data, {
            signal: controller.signal,
            onProgress: (progress) => void send({ type: 'FRAME_PROGRESS', runId, progress }),
          });
          report = mode === 'fill' ? await engine.fill() : await engine.verify();
        } catch (err) {
          report = emptyReport(err instanceof Error ? err.message : String(err));
        } finally {
          active = null;
        }
        void send({ type: 'FRAME_DONE', runId, report });
      })();
      return 'started';
    },
    stop() {
      active?.abort();
    },
    focus(ref) {
      return engine?.focus(ref) ?? false;
    },
  };
  globalThis.__jobfill = api;

  const panel = isTop
    ? new Panel({
        onFill: () => void send({ type: 'FILL_TAB' }),
        onVerify: () => void send({ type: 'VERIFY_TAB' }),
        onStop: () => void send({ type: 'STOP_TAB' }),
        onFocus: (frameId, ref) => void send({ type: 'FOCUS_FIELD', frameId, ref }),
        onOpenOptions: (hash) => void send({ type: 'OPEN_OPTIONS', hash }),
      })
    : null;

  const coordinator = isTop
    ? new RunCoordinator((_runId, report) => {
        panel?.showReport(report);
        void send({ type: 'RUN_COMPLETE', report });
      })
    : null;

  chrome.runtime.onMessage.addListener((message: Message) => {
    switch (message.type) {
      case 'SHOW_BUTTON':
        panel?.showButton();
        break;
      case 'RUN_STARTED':
        // Show the running state first: the coordinator may finish at once
        // (no form on the page, or every frame already reported).
        panel?.showRunning(message.mode);
        coordinator?.started(message.runId, message.mode, message.frameIds, message.profileEmpty);
        break;
      case 'RUN_PROGRESS':
        if (coordinator?.activeRun === message.runId) panel?.showProgress(message.progress);
        break;
      case 'FRAME_REPORT':
        coordinator?.report(message.runId, message.frameId, message.report);
        break;
      case 'STOP_RUN':
        api.stop();
        break;
      case 'SHOW_ERROR':
        panel?.showError(message.error);
        break;
      case 'FOCUS_FIELD':
        api.focus(message.ref);
        break;
      default:
        break;
    }
    return false;
  });

  void setupDetection(store, panel);
}

/** Decide whether to offer the floating button, re-checking as SPAs render. */
async function setupDetection(store: Store, panel: Panel | null): Promise<void> {
  const settings = await store.loadSettings().catch(() => null);
  if (!settings || settings.floatingButton === 'never') return;
  if (panel && settings.floatingButton === 'always') {
    panel.showButton();
    return;
  }

  const check = (): boolean => {
    if (isTop && findEmbeddedAts(document)) {
      panel?.showButton();
      return true;
    }
    if (!pageHasApplication(!knownAts)) return false;
    if (panel) panel.showButton();
    else void send({ type: 'FRAME_HAS_FORM' });
    return true;
  };
  if (check()) return;

  let checks = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const observer = new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      checks++;
      if (check() || checks > 60) observer.disconnect();
    }, 800);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

if (!globalThis.__jobfill) init();
