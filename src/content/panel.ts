/**
 * In-page UI: the floating "Auto-Fill" button and the results panel. Rendered
 * inside a shadow root so page CSS cannot break it (and vice versa).
 */
import { UI_HOST_ID } from '../engine/dom';
import type { TabMissingItem, TabReport } from '../shared/report';
import { clear, h } from '../ui/h';

export interface PanelCallbacks {
  onFill(): void;
  onVerify(): void;
  onFocus(frameId: number, ref: number): void;
  onOpenOptions(hash?: string): void;
}

const CSS = `
:host { all: initial; }
* { box-sizing: border-box; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
.wrap { position: fixed; right: 20px; bottom: 20px; z-index: 2147483647; display: flex; flex-direction: column; align-items: flex-end; gap: 10px; color: #111827; font-size: 13px; line-height: 1.4; }
.fab { display: inline-flex; align-items: center; gap: 8px; border: 0; border-radius: 999px; padding: 11px 18px 11px 14px; background: linear-gradient(135deg, #4f46e5, #7c3aed); color: #fff; font-size: 14px; font-weight: 600; cursor: pointer; box-shadow: 0 8px 24px rgba(79,70,229,.35); transition: transform .15s ease, box-shadow .15s ease; }
.fab:hover { transform: translateY(-1px); box-shadow: 0 10px 28px rgba(79,70,229,.45); }
.fab:disabled { opacity: .8; cursor: progress; }
.fab-row { display: flex; align-items: center; gap: 6px; }
.hide { border: 0; background: rgba(17,24,39,.55); color: #fff; width: 22px; height: 22px; border-radius: 50%; cursor: pointer; font-size: 13px; line-height: 22px; padding: 0; opacity: 0; transition: opacity .15s; }
.fab-row:hover .hide, .hide:focus-visible { opacity: 1; }
.panel { width: 360px; max-height: min(70vh, 560px); display: flex; flex-direction: column; background: #fff; border: 1px solid #e5e7eb; border-radius: 14px; box-shadow: 0 20px 50px rgba(17,24,39,.22); overflow: hidden; }
.head { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; border-bottom: 1px solid #f3f4f6; }
.brand { display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 14px; }
.chip { font-size: 11px; font-weight: 600; color: #4338ca; background: #eef2ff; border-radius: 999px; padding: 2px 8px; }
.x { border: 0; background: transparent; font-size: 18px; line-height: 1; cursor: pointer; color: #6b7280; padding: 4px; }
.body { padding: 12px 14px; overflow: auto; }
.stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 12px; }
.stat { border-radius: 10px; padding: 8px; text-align: center; }
.stat b { display: block; font-size: 20px; }
.stat span { font-size: 11px; }
.ok { background: #f0fdf4; color: #166534; }
.bad { background: #fef2f2; color: #991b1b; }
.warn { background: #fffbeb; color: #92400e; }
h4 { margin: 12px 0 6px; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: #6b7280; }
ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
li button { width: 100%; text-align: left; border: 1px solid #f3f4f6; background: #fafafa; border-radius: 8px; padding: 7px 10px; cursor: pointer; font-size: 13px; color: inherit; display: flex; justify-content: space-between; gap: 8px; }
li button:hover { background: #f5f3ff; border-color: #ddd6fe; }
.req li button { border-left: 3px solid #dc2626; }
.opt li button { border-left: 3px dashed #d97706; }
.kind { color: #9ca3af; font-size: 11px; white-space: nowrap; }
.filled li { padding: 4px 2px; display: flex; justify-content: space-between; gap: 8px; border-bottom: 1px dashed #f3f4f6; }
.filled .val { color: #6b7280; max-width: 55%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
details summary { cursor: pointer; color: #4b5563; font-size: 12px; margin-top: 12px; }
.note { padding: 10px; border-radius: 10px; background: #f9fafb; color: #374151; margin-bottom: 10px; }
.note.error { background: #fef2f2; color: #991b1b; }
.foot { display: flex; gap: 8px; padding: 10px 14px; border-top: 1px solid #f3f4f6; }
.btn { flex: 1; border: 1px solid #e5e7eb; background: #fff; border-radius: 8px; padding: 8px; cursor: pointer; font-weight: 600; font-size: 12px; color: #111827; }
.btn.primary { background: #4f46e5; color: #fff; border-color: #4f46e5; }
.spinner { width: 16px; height: 16px; border: 2px solid rgba(255,255,255,.4); border-top-color: #fff; border-radius: 50%; animation: spin .8s linear infinite; }
.running { display: flex; align-items: center; gap: 10px; padding: 18px 14px; color: #374151; }
.running .spinner { border-color: #e5e7eb; border-top-color: #4f46e5; }
@keyframes spin { to { transform: rotate(360deg); } }
.all-good { text-align: center; padding: 8px 0 4px; color: #166534; font-weight: 600; }
`;

const KIND_LABEL: Record<string, string> = {
  text: 'text',
  textarea: 'text',
  select: 'dropdown',
  combobox: 'dropdown',
  radio: 'choice',
  checkbox: 'checkbox',
  'checkbox-group': 'checkboxes',
  file: 'file',
  date: 'date',
};

function boltIcon(size = 16): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', 'M13 2 4 14h7l-1 8 9-12h-7l1-8z');
  path.setAttribute('fill', 'currentColor');
  svg.appendChild(path);
  return svg;
}

export class Panel {
  private host: HTMLElement | null = null;
  private root: ShadowRoot | null = null;
  private wrap!: HTMLDivElement;
  private panelSlot!: HTMLDivElement;
  private fab!: HTMLButtonElement;
  private buttonVisible = false;

  constructor(private readonly cb: PanelCallbacks) {}

  private mount(): void {
    if (this.host?.isConnected) return;
    this.host = document.createElement('div');
    this.host.id = UI_HOST_ID;
    this.root = this.host.attachShadow({ mode: 'open' });
    this.root.appendChild(h('style', null, CSS));
    this.panelSlot = h('div');
    this.fab = h(
      'button',
      {
        class: 'fab',
        type: 'button',
        title: 'Auto-fill this application (Alt+Shift+F)',
        on: { click: () => this.cb.onFill() },
      },
      boltIcon(),
      'Auto-Fill',
    );
    const hideBtn = h(
      'button',
      {
        class: 'hide',
        type: 'button',
        title: 'Hide on this page',
        attrs: { 'aria-label': 'Hide Auto-Fill button' },
        on: { click: () => this.hideButton() },
      },
      '×',
    );
    this.wrap = h(
      'div',
      { class: 'wrap' },
      this.panelSlot,
      h('div', { class: 'fab-row' }, hideBtn, this.fab),
    );
    this.root.appendChild(this.wrap);
    (document.body ?? document.documentElement).appendChild(this.host);
  }

  showButton(): void {
    this.mount();
    this.buttonVisible = true;
    this.fab.parentElement!.style.display = '';
  }

  hideButton(): void {
    this.buttonVisible = false;
    if (this.fab) this.fab.parentElement!.style.display = 'none';
  }

  get isButtonVisible(): boolean {
    return this.buttonVisible;
  }

  close(): void {
    if (this.panelSlot) clear(this.panelSlot);
  }

  private frame(body: Node[], footer: Node[] = [], chip?: string | null): void {
    this.mount();
    if (!this.buttonVisible) this.fab.parentElement!.style.display = 'none';
    clear(this.panelSlot);
    this.panelSlot.appendChild(
      h(
        'div',
        { class: 'panel', attrs: { role: 'dialog', 'aria-label': 'JobFill results' } },
        h(
          'div',
          { class: 'head' },
          h(
            'div',
            { class: 'brand' },
            boltIcon(18),
            'JobFill',
            chip ? h('span', { class: 'chip' }, chip) : null,
          ),
          h(
            'button',
            {
              class: 'x',
              type: 'button',
              attrs: { 'aria-label': 'Close' },
              on: { click: () => this.close() },
            },
            '×',
          ),
        ),
        h('div', { class: 'body', attrs: { 'aria-live': 'polite' } }, ...body),
        footer.length ? h('div', { class: 'foot' }, ...footer) : null,
      ),
    );
  }

  showRunning(mode: 'fill' | 'verify'): void {
    if (this.fab) this.fab.disabled = true;
    this.frame([
      h(
        'div',
        { class: 'running' },
        h('div', { class: 'spinner' }),
        mode === 'fill' ? 'Filling your application…' : 'Checking every field…',
      ),
    ]);
  }

  showError(message: string): void {
    if (this.fab) this.fab.disabled = false;
    this.frame(
      [h('div', { class: 'note error' }, message)],
      [this.button('Try again', () => this.cb.onFill(), true)],
    );
  }

  private button(label: string, onClick: () => void, primary = false): HTMLButtonElement {
    return h(
      'button',
      { class: primary ? 'btn primary' : 'btn', type: 'button', on: { click: onClick } },
      label,
    );
  }

  private missingList(items: TabMissingItem[], cls: string): HTMLElement {
    return h(
      'ul',
      { class: cls },
      ...items.map((m) =>
        h(
          'li',
          null,
          h(
            'button',
            {
              type: 'button',
              title: 'Scroll to this field',
              on: { click: () => this.cb.onFocus(m.frameId, m.ref) },
            },
            h('span', null, m.label),
            h('span', { class: 'kind' }, KIND_LABEL[m.kind] ?? m.kind),
          ),
        ),
      ),
    );
  }

  showReport(report: TabReport): void {
    if (this.fab) this.fab.disabled = false;
    const body: Node[] = [];

    if (report.profileEmpty) {
      body.push(
        h(
          'div',
          { class: 'note' },
          'Your profile is empty. Add your details once and JobFill will reuse them on every application.',
        ),
      );
    }
    if (report.errors.length) body.push(h('div', { class: 'note error' }, report.errors.join(' ')));

    if (report.noForm) {
      body.push(
        h(
          'div',
          { class: 'note' },
          'No application form was found on this page. Open the application step and try again.',
        ),
      );
    } else {
      body.push(
        h(
          'div',
          { class: 'stats' },
          h(
            'div',
            { class: 'stat ok' },
            h('b', null, report.filledCount),
            h('span', null, report.mode === 'fill' ? 'filled now' : 'fields'),
          ),
          h(
            'div',
            { class: 'stat bad' },
            h('b', null, report.requiredMissing),
            h('span', null, 'required empty'),
          ),
          h(
            'div',
            { class: 'stat warn' },
            h('b', null, report.optionalMissing),
            h('span', null, 'optional empty'),
          ),
        ),
      );
      const required = report.missing.filter((m) => m.required);
      const optional = report.missing.filter((m) => !m.required);
      if (!required.length && !optional.length) {
        body.push(
          h('div', { class: 'all-good' }, 'Every field has a value. Review and submit when ready.'),
        );
      }
      if (required.length)
        body.push(h('h4', null, 'Needs your attention'), this.missingList(required, 'req'));
      if (optional.length)
        body.push(h('h4', null, 'Optional fields left empty'), this.missingList(optional, 'opt'));

      const filled = report.fields.filter((f) => f.status === 'filled');
      if (filled.length) {
        body.push(
          h(
            'details',
            null,
            h('summary', null, `Filled by JobFill (${filled.length})`),
            h(
              'ul',
              { class: 'filled' },
              ...filled.map((f) =>
                h(
                  'li',
                  null,
                  h('span', null, f.label),
                  h('span', { class: 'val' }, f.detail ?? ''),
                ),
              ),
            ),
          ),
        );
      }
      const unmatched = report.fields.filter(
        (f) => f.status === 'no-match' || f.status === 'failed',
      );
      if (unmatched.length) {
        body.push(
          h(
            'details',
            null,
            h('summary', null, `Couldn't answer (${unmatched.length})`),
            h(
              'ul',
              { class: 'filled' },
              ...unmatched.map((f) =>
                h(
                  'li',
                  null,
                  h('span', null, f.label),
                  h('span', { class: 'val' }, f.detail ?? f.status),
                ),
              ),
            ),
          ),
        );
      }
    }

    const footer = [
      this.button('Re-check', () => this.cb.onVerify()),
      this.button('Edit profile', () =>
        this.cb.onOpenOptions(report.profileEmpty ? 'personal' : undefined),
      ),
      this.button('Fill again', () => this.cb.onFill(), true),
    ];
    this.frame(body, footer, report.ats);
  }
}
