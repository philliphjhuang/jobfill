import { describe, expect, it } from 'vitest';
import { Pacer, RunAborted } from '../../src/engine/pacing';
import { typeText } from '../../src/engine/typing';
import { DEFAULT_PACING } from '../../src/shared/defaults';
import { mount } from '../helpers/fixtures';

function pacer(
  onSleep: (ms: number, call: number) => void = () => undefined,
  signal?: AbortSignal,
) {
  let call = 0;
  return new Pacer(
    { ...DEFAULT_PACING },
    {
      signal,
      sleep: async (ms, s) => {
        onSleep(ms, ++call);
        if (s?.aborted) throw new RunAborted();
      },
    },
  );
}

function input(html = '<input id="f">'): HTMLInputElement {
  mount(html);
  return document.getElementById('f') as HTMLInputElement;
}

describe('typeText', () => {
  it('types one character at a time with real key and input events', async () => {
    const el = input();
    const log: string[] = [];
    for (const type of ['keydown', 'keypress', 'beforeinput', 'input', 'keyup', 'change', 'blur']) {
      el.addEventListener(type, (e) => {
        const key = (e as KeyboardEvent).key ?? (e as InputEvent).data ?? '';
        log.push(type === 'input' ? `input:${el.value}` : `${type}:${key ?? ''}`);
      });
    }
    const sleeps: number[] = [];
    await typeText(
      el,
      'Ada',
      pacer((ms) => sleeps.push(ms)),
    );

    expect(el.value).toBe('Ada');
    expect(log).toEqual([
      'keydown:A',
      'keypress:A',
      'beforeinput:A',
      'input:A',
      'keyup:A',
      'keydown:d',
      'keypress:d',
      'beforeinput:d',
      'input:Ad',
      'keyup:d',
      'keydown:a',
      'keypress:a',
      'beforeinput:a',
      'input:Ada',
      'keyup:a',
      'change:',
      'blur:',
    ]);
    // A pause between characters, not before the first one.
    expect(sleeps).toHaveLength(2);
    sleeps.forEach((ms) => {
      expect(ms).toBeGreaterThanOrEqual(100);
      expect(ms).toBeLessThanOrEqual(900);
    });
  });

  it('lets an input mask refuse characters, like real typing', async () => {
    const el = input();
    el.addEventListener('keydown', (e) => {
      if (e.key.length === 1 && !/\d/.test(e.key)) e.preventDefault();
    });
    await typeText(el, '(415) 555-0100', pacer());
    expect(el.value).toBe('4155550100');
  });

  it('builds number fields from the typed text so "3." is never rejected', async () => {
    const el = input('<input id="f" type="number">');
    await typeText(el, '3.85', pacer());
    expect(el.value).toBe('3.85');
  });

  it('presses Enter for line breaks in text areas and flattens them in inputs', async () => {
    mount('<textarea id="t"></textarea><input id="i">');
    const area = document.getElementById('t') as HTMLTextAreaElement;
    const keys: string[] = [];
    area.addEventListener('keydown', (e) => keys.push(e.key));
    await typeText(area, 'a\nb', pacer());
    expect(area.value).toBe('a\nb');
    expect(keys).toEqual(['a', 'Enter', 'b']);
    const line = document.getElementById('i') as HTMLInputElement;
    await typeText(line, 'a\nb', pacer());
    expect(line.value).toBe('a b');
  });

  it('completes the field at once when stopped mid-way', async () => {
    const el = input();
    const controller = new AbortController();
    let changes = 0;
    el.addEventListener('change', () => changes++);
    const p = pacer((_ms, call) => {
      if (call === 2) controller.abort();
    }, controller.signal);
    await expect(typeText(el, 'ada@example.com', p)).rejects.toBeInstanceOf(RunAborted);
    expect(el.value).toBe('ada@example.com');
    expect(changes).toBe(1);
  });
});
