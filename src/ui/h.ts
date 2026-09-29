/**
 * Tiny DOM builder. Text is always assigned via text nodes, never parsed as
 * HTML, so labels scraped from arbitrary web pages cannot inject markup.
 */
type Child = Node | string | number | null | undefined | false;

export interface Props {
  class?: string;
  style?: string;
  dataset?: Record<string, string>;
  attrs?: Record<string, string | boolean | undefined>;
  on?: Partial<Record<keyof HTMLElementEventMap, (e: Event) => void>>;
  [prop: string]: unknown;
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props | null = null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value === undefined || value === null) continue;
      if (key === 'class') el.className = String(value);
      else if (key === 'style') el.setAttribute('style', String(value));
      else if (key === 'dataset') Object.assign(el.dataset, value);
      else if (key === 'attrs') {
        for (const [a, v] of Object.entries(value as Record<string, unknown>)) {
          if (v === false || v === undefined) continue;
          el.setAttribute(a, v === true ? '' : String(v));
        }
      } else if (key === 'on') {
        for (const [evt, handler] of Object.entries(value as Record<string, EventListener>)) {
          el.addEventListener(evt, handler);
        }
      } else {
        (el as unknown as Record<string, unknown>)[key] = value;
      }
    }
  }
  append(el, children);
  return el;
}

export function append(parent: Node, children: Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    parent.appendChild(typeof child === 'object' ? child : document.createTextNode(String(child)));
  }
}

export function clear(el: Node): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}
