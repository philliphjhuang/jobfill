/**
 * Low-level DOM helpers. Everything that touches page internals (events,
 * value setters, visibility) lives here so fillers stay declarative.
 */

/** Id of the shadow host used by the in-page UI; never scanned or filled. */
export const UI_HOST_ID = 'jobfill-host';

/**
 * Runtime switches. `layout` is turned off in unit tests because jsdom has no
 * layout engine (every element reports a 0x0 box).
 */
export const env = {
  layout: true,
};

const TEXT_NODE = 3;
const ELEMENT_NODE = 1;

const SKIP_TEXT_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'NOSCRIPT',
  'TEMPLATE',
  'SELECT',
  'OPTION',
  'TEXTAREA',
  'INPUT',
  'SVG',
  'svg',
]);

export function isOwnUi(el: Element): boolean {
  return el.id === UI_HOST_ID || !!el.closest?.(`#${UI_HOST_ID}`);
}

/** Visible text of a node, excluding form controls (and buttons unless asked). */
export function textOf(
  node: Node | null | undefined,
  opts: { includeButtons?: boolean } = {},
): string {
  if (!node) return '';
  const parts: string[] = [];
  const walk = (n: Node): void => {
    if (n.nodeType === TEXT_NODE) {
      parts.push(n.nodeValue ?? '');
      return;
    }
    if (n.nodeType !== ELEMENT_NODE) return;
    const el = n as Element;
    if (SKIP_TEXT_TAGS.has(el.tagName)) return;
    if (el.tagName === 'BUTTON' && !opts.includeButtons) return;
    if (el.hasAttribute('hidden') || el.id === UI_HOST_ID) return;
    const style = (el as HTMLElement).style;
    if (style && style.display === 'none') return;
    for (let c = el.firstChild; c; c = c.nextSibling) walk(c);
    parts.push(' ');
  };
  walk(node);
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

export function isVisible(el: Element): boolean {
  if (!el.isConnected) return false;
  if (el.closest('[hidden]')) return false;
  const view = el.ownerDocument.defaultView;
  if (env.layout) {
    const check = (el as Element & { checkVisibility?: (o?: object) => boolean }).checkVisibility;
    if (typeof check === 'function') {
      if (!check.call(el, { visibilityProperty: true })) return false;
    } else if (view) {
      const cs = view.getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') return false;
    }
    const rect = el.getBoundingClientRect();
    return rect.width >= 1 || rect.height >= 1;
  }
  if (!view) return true;
  for (let cur: Element | null = el; cur; cur = cur.parentElement) {
    const cs = view.getComputedStyle(cur);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
  }
  return true;
}

export function isDisabled(el: Element): boolean {
  if ((el as HTMLInputElement).disabled) return true;
  if (el.getAttribute('aria-disabled') === 'true') return true;
  return !!el.closest('fieldset[disabled]');
}

/**
 * Collect elements in document order, descending into open shadow roots and
 * skipping the extension's own UI.
 */
export function collectElements(root: ParentNode, match: (el: Element) => boolean): Element[] {
  const out: Element[] = [];
  const visit = (node: ParentNode): void => {
    for (let child = node.firstElementChild; child; child = child.nextElementSibling) {
      if (child.id === UI_HOST_ID) continue;
      if (match(child)) out.push(child);
      const shadow = (child as HTMLElement).shadowRoot;
      if (shadow) visit(shadow);
      if (child.tagName !== 'TEMPLATE') visit(child);
    }
  };
  visit(root);
  return out;
}

/** `Element.closest` that continues through shadow-root boundaries to the host. */
export function closestDeep(el: Element, selector: string): Element | null {
  for (let cur: Element | null = el; cur;) {
    const hit = cur.closest(selector);
    if (hit) return hit;
    const root = cur.getRootNode();
    cur = root instanceof ShadowRoot ? root.host : null;
  }
  return null;
}

export function queryAllDeep<T extends Element = Element>(root: ParentNode, selector: string): T[] {
  return collectElements(root, (el) => el.matches(selector)) as T[];
}

export function getById(el: Element, id: string): Element | null {
  const root = el.getRootNode() as Document | ShadowRoot;
  return typeof root.getElementById === 'function'
    ? root.getElementById(id)
    : el.ownerDocument.getElementById(id);
}

function findSetter(obj: object, prop: string): ((v: unknown) => void) | undefined {
  for (let p: object | null = Object.getPrototypeOf(obj); p; p = Object.getPrototypeOf(p)) {
    const desc = Object.getOwnPropertyDescriptor(p, prop);
    if (desc?.set) return desc.set;
  }
  return undefined;
}

/**
 * Set a form control's value through the prototype setter so frameworks that
 * track the instance value (React, Preact, Vue) notice the change.
 */
export function setNativeValue(
  el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  value: string,
): void {
  const setter = findSetter(el, 'value');
  if (setter) setter.call(el, value);
  else el.value = value;
}

function win(el: Element): Window & typeof globalThis {
  return (el.ownerDocument.defaultView ?? window) as Window & typeof globalThis;
}

export function dispatchInput(el: Element, data?: string): void {
  const w = win(el);
  const InputEventCtor = w.InputEvent ?? w.Event;
  el.dispatchEvent(
    new InputEventCtor('input', {
      bubbles: true,
      composed: true,
      ...(w.InputEvent ? { inputType: 'insertText', data: data ?? null } : {}),
    }),
  );
}

export function dispatchChange(el: Element): void {
  el.dispatchEvent(new (win(el).Event)('change', { bubbles: true }));
}

export function focusQuietly(el: Element): void {
  try {
    (el as HTMLElement).focus({ preventScroll: true });
  } catch {
    /* element not focusable */
  }
}

export function blurQuietly(el: Element): void {
  try {
    (el as HTMLElement).blur();
  } catch {
    /* ignore */
  }
  el.dispatchEvent(new (win(el).FocusEvent)('focusout', { bubbles: true }));
}

/** Type a whole value into a text control the way a user paste would. */
export function typeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  focusQuietly(el);
  setNativeValue(el, value);
  dispatchInput(el, value);
  dispatchChange(el);
}

export function pressKey(el: Element, key: string): void {
  const w = win(el);
  const codes: Record<string, number> = { Enter: 13, Escape: 27, ArrowDown: 40, Tab: 9, ' ': 32 };
  for (const type of ['keydown', 'keyup'] as const) {
    const ev = new w.KeyboardEvent(type, { key, bubbles: true, cancelable: true, composed: true });
    const keyCode = codes[key] ?? 0;
    Object.defineProperty(ev, 'keyCode', { get: () => keyCode });
    Object.defineProperty(ev, 'which', { get: () => keyCode });
    el.dispatchEvent(ev);
  }
}

/** Full pointer + mouse sequence for custom widgets that ignore bare `click()`. */
export function simulateClick(el: Element): void {
  const w = win(el);
  const rect = env.layout ? el.getBoundingClientRect() : { left: 0, top: 0, width: 0, height: 0 };
  const init = {
    bubbles: true,
    cancelable: true,
    composed: true,
    button: 0,
    clientX: rect.left + rect.width / 2,
    clientY: rect.top + rect.height / 2,
  };
  const PointerCtor = typeof w.PointerEvent === 'function' ? w.PointerEvent : null;
  if (PointerCtor)
    el.dispatchEvent(new PointerCtor('pointerdown', { ...init, pointerType: 'mouse' }));
  el.dispatchEvent(new w.MouseEvent('mousedown', init));
  if (PointerCtor)
    el.dispatchEvent(new PointerCtor('pointerup', { ...init, pointerType: 'mouse' }));
  el.dispatchEvent(new w.MouseEvent('mouseup', init));
  el.dispatchEvent(new w.MouseEvent('click', init));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitFor<T>(
  probe: () => T | null | undefined | false,
  timeoutMs: number,
  intervalMs = 50,
): Promise<T | null> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = probe();
    if (value) return value;
    if (Date.now() >= deadline) return null;
    await sleep(intervalMs);
  }
}

/** Resolve once the subtree has had no mutations for `quietMs` (or `maxMs` elapsed). */
export function waitForDomSettled(root: Node, quietMs: number, maxMs: number): Promise<void> {
  return new Promise((resolve) => {
    let quietTimer: ReturnType<typeof setTimeout>;
    const done = (): void => {
      clearTimeout(quietTimer);
      clearTimeout(maxTimer);
      observer.disconnect();
      resolve();
    };
    const observer = new MutationObserver(() => {
      clearTimeout(quietTimer);
      quietTimer = setTimeout(done, quietMs);
    });
    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    });
    quietTimer = setTimeout(done, quietMs);
    const maxTimer = setTimeout(done, maxMs);
  });
}

export function scrollIntoView(el: Element): void {
  try {
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  } catch {
    /* jsdom */
  }
}
