/**
 * Character-by-character typing. Each character produces the same event
 * sequence a real keystroke does (keydown → keypress → beforeinput → value
 * change → input → keyup), so frameworks, input masks and live validation see
 * ordinary typing. Pauses between characters come from the Pacer.
 */
import { blurQuietly, dispatchChange, focusQuietly, setNativeValue } from './dom';
import { RunAborted, type Pacer } from './pacing';

type TextControl = HTMLInputElement | HTMLTextAreaElement;

function win(el: Element): Window & typeof globalThis {
  return (el.ownerDocument.defaultView ?? window) as Window & typeof globalThis;
}

function codeFor(key: string): string {
  if (/^[a-z]$/i.test(key)) return `Key${key.toUpperCase()}`;
  if (/^\d$/.test(key)) return `Digit${key}`;
  if (key === ' ') return 'Space';
  if (key === 'Enter' || key === 'Backspace') return key;
  return '';
}

function keyCodeFor(key: string): number {
  if (key === 'Enter') return 13;
  if (key === 'Backspace') return 8;
  if (key === ' ') return 32;
  if (/^[a-z0-9]$/i.test(key)) return key.toUpperCase().charCodeAt(0);
  return 0;
}

/** Dispatch a keyboard event; returns false when the page cancelled it. */
function keyEvent(el: Element, type: 'keydown' | 'keypress' | 'keyup', key: string): boolean {
  const ev = new (win(el).KeyboardEvent)(type, {
    key,
    code: codeFor(key),
    bubbles: true,
    cancelable: true,
    composed: true,
  });
  // Legacy properties some input masks still read.
  const keyCode =
    type === 'keypress' ? (key === 'Enter' ? 13 : key.charCodeAt(0)) : keyCodeFor(key);
  Object.defineProperty(ev, 'keyCode', { get: () => keyCode });
  Object.defineProperty(ev, 'which', { get: () => keyCode });
  Object.defineProperty(ev, 'charCode', { get: () => (type === 'keypress' ? keyCode : 0) });
  return el.dispatchEvent(ev);
}

function inputEvent(
  el: Element,
  type: 'beforeinput' | 'input',
  inputType: string,
  data: string | null,
): boolean {
  const w = win(el);
  const init = { bubbles: true, composed: true, cancelable: type === 'beforeinput' };
  const ev =
    typeof w.InputEvent === 'function'
      ? new w.InputEvent(type, { ...init, inputType, data })
      : new w.Event(type, init);
  return el.dispatchEvent(ev);
}

/** Number inputs reject partial values like "3." — those are typed from our own buffer. */
const BUFFERED_TYPES = new Set(['number']);

/** Type one character. `typedSoFar` is used for buffered input types only. */
export function typeChar(el: TextControl, ch: string, typedSoFar: string): void {
  const key = ch === '\n' ? 'Enter' : ch;
  const inputType = ch === '\n' ? 'insertLineBreak' : 'insertText';
  // A cancelled keydown/keypress means the page handled (or refused) the key itself.
  if (!keyEvent(el, 'keydown', key) || (key !== 'Enter' && !keyEvent(el, 'keypress', key))) {
    keyEvent(el, 'keyup', key);
    return;
  }
  if (inputEvent(el, 'beforeinput', inputType, ch)) {
    setNativeValue(el, BUFFERED_TYPES.has(el.type) ? typedSoFar : el.value + ch);
    inputEvent(el, 'input', inputType, ch);
  }
  keyEvent(el, 'keyup', key);
}

/** Select-all + delete, like a person clearing a field before typing. */
export function clearText(el: TextControl): void {
  if (!el.value) return;
  keyEvent(el, 'keydown', 'Backspace');
  if (inputEvent(el, 'beforeinput', 'deleteContentBackward', null)) {
    setNativeValue(el, '');
    inputEvent(el, 'input', 'deleteContentBackward', null);
  }
  keyEvent(el, 'keyup', 'Backspace');
}

export interface TypeOptions {
  /** Fire `change` and leave the field when done (default true). */
  commit?: boolean;
}

/**
 * Type `text` into a field one character at a time, pausing between
 * keystrokes. If the user stops the run mid-field, the field is completed at
 * once (a half-typed email is worse than either outcome) before stopping.
 */
export async function typeText(
  el: TextControl,
  text: string,
  pacer: Pacer,
  opts: TypeOptions = {},
): Promise<void> {
  const commit = opts.commit !== false;
  const chars = Array.from(el.tagName === 'TEXTAREA' ? text : text.replace(/\r?\n/g, ' '));
  focusQuietly(el);
  let typed = '';
  try {
    for (const ch of chars) {
      if (typed) await pacer.key();
      typed += ch;
      typeChar(el, ch, typed);
    }
  } catch (err) {
    if (err instanceof RunAborted && commit) {
      setNativeValue(el, chars.join(''));
      inputEvent(el, 'input', 'insertReplacementText', null);
      dispatchChange(el);
      blurQuietly(el);
    }
    throw err;
  }
  if (commit) {
    dispatchChange(el);
    blurQuietly(el);
  }
}
