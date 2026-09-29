/**
 * Content script: runs in every frame. Exposes `__jobfill.run()` for the
 * service worker (which calls it in all frames via chrome.scripting) and,
 * in the top frame, shows the floating button and results panel.
 */
import { findEmbeddedAts, detectAts } from '../engine/ats';
import { classifyAll } from '../engine/classifier';
import { FillEngine, looksLikeApplication, scopeToApplication } from '../engine/engine';
import { scanFields } from '../engine/scanner';
import type { Message } from '../shared/messages';
import type { FrameReport } from '../shared/report';
import { Store } from '../shared/storage';
import { Panel } from './panel';

interface JobfillApi {
  run(mode: 'fill' | 'verify'): Promise<FrameReport | null>;
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
  let running: Promise<FrameReport | null> | null = null;

  const api: JobfillApi = {
    run(mode) {
      if (running) return running;
      running = (async () => {
        try {
          // Ad/embed frames: skip without loading the profile and resume into memory.
          if (!pageHasApplication(false)) return emptyReport();
          const data = await store.loadAll();
          engine = new FillEngine(document, data);
          return mode === 'fill' ? await engine.fill() : await engine.verify();
        } catch (err) {
          return emptyReport(err instanceof Error ? err.message : String(err));
        } finally {
          running = null;
        }
      })();
      return running;
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
        onFocus: (frameId, ref) => void send({ type: 'FOCUS_FIELD', frameId, ref }),
        onOpenOptions: (hash) => void send({ type: 'OPEN_OPTIONS', hash }),
      })
    : null;

  chrome.runtime.onMessage.addListener((message: Message) => {
    switch (message.type) {
      case 'SHOW_BUTTON':
        panel?.showButton();
        break;
      case 'RUN_STARTED':
        panel?.showRunning(message.mode);
        break;
      case 'SHOW_REPORT':
        panel?.showReport(message.report);
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
