/**
 * Profile editor. Renders SECTIONS from schema.ts, binds inputs to the
 * in-memory state and auto-saves to chrome.storage.local.
 */
import { completenessPercent, profileChecklist } from '../shared/completeness';
import { createEmptyDocuments, normalizeProfile, normalizeSettings } from '../shared/defaults';
import { base64ToBytes, fileToStoredFile, formatBytes } from '../shared/files';
import { MAX_FILE_BYTES, Store } from '../shared/storage';
import type { Documents, Profile, Settings, StoredFile } from '../shared/types';
import { clear, h } from '../ui/h';
import {
  DEGREE_SUGGESTIONS,
  SECTIONS,
  type FieldDef,
  type ListDef,
  type SectionDef,
} from './schema';

const store = new Store();

interface State {
  profile: Profile;
  settings: Settings;
}

let state: State;
let documents: Documents = createEmptyDocuments();
const sectionEls = new Map<string, HTMLElement>();
const statusEl = h('span', { class: 'status', attrs: { role: 'status' } }, '');
const progressEl = h('div', { class: 'progress-card' });

// ── Paths ────────────────────────────────────────────────────────────────────

function getPath(obj: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (acc, key) => (acc == null ? undefined : (acc as Record<string, unknown>)[key]),
      obj,
    );
}

function setPath(obj: unknown, path: string, value: unknown): void {
  const keys = path.split('.');
  const last = keys.pop()!;
  const target = keys.reduce<Record<string, unknown>>(
    (acc, key) => acc[key] as Record<string, unknown>,
    obj as Record<string, unknown>,
  );
  target[last] = value;
}

// ── Saving ───────────────────────────────────────────────────────────────────

let saveTimer: ReturnType<typeof setTimeout> | undefined;

function setStatus(text: string, kind: 'ok' | 'busy' | 'error' = 'ok'): void {
  statusEl.textContent = text;
  statusEl.className = `status ${kind}`;
}

function scheduleSave(): void {
  setStatus('Saving…', 'busy');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      state.profile = await store.saveProfile(state.profile);
      await store.saveSettings(state.settings);
      setStatus('All changes saved');
      renderProgress();
    } catch (err) {
      setStatus(`Save failed: ${err instanceof Error ? err.message : String(err)}`, 'error');
    }
  }, 400);
}

function update(path: string, value: unknown): void {
  setPath(state, path, value);
  scheduleSave();
}

// ── Validation ───────────────────────────────────────────────────────────────

function validate(kind: FieldDef['kind'], value: string): string {
  if (!value) return '';
  if (kind === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
    return 'This does not look like an email address.';
  if (kind === 'url' && !/^https?:\/\/\S+\.\S+/.test(value))
    return 'Use a full link starting with https://';
  return '';
}

// ── Field rendering ──────────────────────────────────────────────────────────

function fieldId(path: string): string {
  return `f-${path.replace(/[^\w]+/g, '-')}`;
}

function renderField(def: FieldDef, path: string, onChange?: () => void): HTMLElement {
  const id = fieldId(path);
  const value = getPath(state, path);
  const wrap = h('div', { class: `field span-${def.span ?? 3}` });
  const help = def.help ? h('small', { class: 'help' }, def.help) : null;
  const error = h('small', { class: 'error' });
  const changed = (v: unknown): void => {
    update(path, v);
    onChange?.();
  };

  switch (def.kind) {
    case 'checkbox': {
      const input = h('input', { type: 'checkbox', id, checked: value === true });
      input.addEventListener('change', () => changed(input.checked));
      wrap.classList.add('check');
      wrap.append(h('label', { htmlFor: id }, input, h('span', null, def.label)), help ?? '');
      return wrap;
    }
    case 'multicheck': {
      const selected = new Set(Array.isArray(value) ? (value as string[]) : []);
      const boxes = def.options.map((opt) => {
        const input = h('input', {
          type: 'checkbox',
          value: opt.value,
          checked: selected.has(opt.value),
        });
        input.addEventListener('change', () => {
          if (input.checked) selected.add(opt.value);
          else selected.delete(opt.value);
          changed(def.options.map((o) => o.value).filter((v) => selected.has(v)));
        });
        return h('label', { class: 'chip-check' }, input, h('span', null, opt.label));
      });
      wrap.append(
        h('fieldset', null, h('legend', null, def.label), h('div', { class: 'chips' }, ...boxes)),
        help ?? '',
      );
      return wrap;
    }
    case 'select': {
      const select = h(
        'select',
        { id },
        ...def.options.map((o) =>
          h('option', { value: o.value, selected: o.value === value }, o.label),
        ),
      );
      select.addEventListener('change', () => changed(select.value));
      wrap.append(h('label', { htmlFor: id }, def.label), select, help ?? '');
      return wrap;
    }
    case 'textarea':
    case 'lines': {
      const text =
        def.kind === 'lines'
          ? Array.isArray(value)
            ? (value as string[]).join('\n')
            : ''
          : String(value ?? '');
      const area = h('textarea', {
        id,
        rows: def.kind === 'textarea' ? (def.rows ?? 3) : 4,
        placeholder: def.placeholder ?? '',
        value: text,
      });
      area.addEventListener('input', () =>
        changed(
          def.kind === 'lines'
            ? area.value
                .split('\n')
                .map((s) => s.trim())
                .filter(Boolean)
            : area.value,
        ),
      );
      wrap.append(h('label', { htmlFor: id }, def.label), area, help ?? '');
      return wrap;
    }
    default: {
      const input = h('input', {
        id,
        type: def.kind,
        value: String(value ?? ''),
        placeholder: def.placeholder ?? '',
        autocomplete: def.autocomplete ?? 'off',
      });
      if (def.list) input.setAttribute('list', def.list);
      input.addEventListener('input', () => changed(input.value.trim() === '' ? '' : input.value));
      input.addEventListener('blur', () => {
        error.textContent = validate(def.kind, input.value.trim());
      });
      wrap.append(h('label', { htmlFor: id }, def.label), input, help ?? '', error);
      return wrap;
    }
  }
}

function renderFields(fields: FieldDef[], prefix = ''): HTMLElement {
  return h('div', { class: 'grid' }, ...fields.map((f) => renderField(f, prefix + f.path)));
}

// ── Lists (work, education, custom answers) ──────────────────────────────────

function renderList(section: SectionDef, list: ListDef): HTMLElement {
  const items = getPath(state, list.path) as Array<Record<string, unknown>>;
  const container = h('div', { class: 'list' });
  const rerender = (): void => renderSection(section);

  if (!items.length) container.append(h('p', { class: 'empty' }, list.empty));

  items.forEach((item, i) => {
    const title = h('strong', null, list.title(item, i));
    const move = (delta: number): void => {
      const j = i + delta;
      if (j < 0 || j >= items.length) return;
      [items[i], items[j]] = [items[j]!, items[i]!];
      scheduleSave();
      rerender();
    };
    const grid = h(
      'div',
      { class: 'grid' },
      ...list.fields.map((f) =>
        renderField(
          f,
          `${list.path}.${i}.${f.path}`,
          () => (title.textContent = list.title(item, i)),
        ),
      ),
    );
    container.append(
      h(
        'div',
        { class: 'card item' },
        h(
          'div',
          { class: 'item-head' },
          title,
          h(
            'div',
            { class: 'item-actions' },
            h(
              'button',
              {
                type: 'button',
                class: 'icon',
                title: 'Move up',
                disabled: i === 0,
                on: { click: () => move(-1) },
              },
              '↑',
            ),
            h(
              'button',
              {
                type: 'button',
                class: 'icon',
                title: 'Move down',
                disabled: i === items.length - 1,
                on: { click: () => move(1) },
              },
              '↓',
            ),
            h(
              'button',
              {
                type: 'button',
                class: 'icon danger',
                title: 'Remove',
                on: {
                  click: () => {
                    if (!confirm(`Remove "${list.title(item, i)}"?`)) return;
                    items.splice(i, 1);
                    scheduleSave();
                    rerender();
                  },
                },
              },
              '✕',
            ),
          ),
        ),
        grid,
      ),
    );
  });

  container.append(
    h(
      'button',
      {
        type: 'button',
        class: 'add',
        on: {
          click: () => {
            items.push(list.create() as Record<string, unknown>);
            scheduleSave();
            rerender();
            const cards = sectionEls.get(section.id)?.querySelectorAll('.item');
            cards?.[cards.length - 1]?.querySelector<HTMLInputElement>('input')?.focus();
          },
        },
      },
      list.addLabel,
    ),
  );
  return container;
}

// ── Documents ────────────────────────────────────────────────────────────────

function previewFile(file: StoredFile): void {
  const blob = new Blob([base64ToBytes(file.data) as BlobPart], {
    type: file.type || 'application/octet-stream',
  });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function renderDocuments(section: SectionDef): HTMLElement {
  const row = (key: keyof Documents, label: string): HTMLElement => {
    const current = documents[key];
    const picker = h('input', {
      type: 'file',
      accept: '.pdf,.doc,.docx,.rtf,.txt,.odt',
      class: 'visually-hidden',
      id: `file-${key}`,
    });
    const errorEl = h('small', { class: 'error' });
    picker.addEventListener('change', async () => {
      const file = picker.files?.[0];
      if (!file) return;
      if (file.size > MAX_FILE_BYTES) {
        errorEl.textContent = `File is too large (${formatBytes(file.size)}). The limit is ${formatBytes(MAX_FILE_BYTES)}.`;
        return;
      }
      documents = { ...documents, [key]: await fileToStoredFile(file) };
      await store.saveDocuments(documents);
      setStatus('All changes saved');
      renderSection(section);
      renderProgress();
    });
    return h(
      'div',
      { class: 'doc-row card' },
      h(
        'div',
        null,
        h('strong', null, label),
        h(
          'div',
          { class: 'muted' },
          current
            ? `${current.name} · ${formatBytes(current.size)} · updated ${new Date(current.updatedAt).toLocaleDateString()}`
            : 'No file uploaded',
        ),
        errorEl,
      ),
      h(
        'div',
        { class: 'item-actions' },
        current
          ? h(
              'button',
              { type: 'button', class: 'secondary', on: { click: () => previewFile(current) } },
              'Preview',
            )
          : null,
        current
          ? h(
              'button',
              {
                type: 'button',
                class: 'secondary danger',
                on: {
                  click: async () => {
                    documents = { ...documents, [key]: null };
                    await store.saveDocuments(documents);
                    renderSection(section);
                    renderProgress();
                  },
                },
              },
              'Remove',
            )
          : null,
        h(
          'label',
          { class: 'button primary', htmlFor: `file-${key}` },
          current ? 'Replace' : 'Upload',
        ),
        picker,
      ),
    );
  };
  return h(
    'div',
    { class: 'docs' },
    row('resume', 'Resume / CV'),
    row('coverLetter', 'Cover letter (file)'),
  );
}

// ── History & data ───────────────────────────────────────────────────────────

function renderHistory(section: SectionDef): HTMLElement {
  const wrap = h('div', null, h('p', { class: 'muted' }, 'Loading…'));
  void store.loadHistory().then((history) => {
    clear(wrap);
    if (!history.length) {
      wrap.append(h('p', { class: 'empty' }, 'Applications you auto-fill will be listed here.'));
      return;
    }
    wrap.append(
      h(
        'div',
        { class: 'table-wrap' },
        h(
          'table',
          null,
          h(
            'thead',
            null,
            h(
              'tr',
              null,
              h('th', null, 'Date'),
              h('th', null, 'Page'),
              h('th', null, 'ATS'),
              h('th', null, 'Filled'),
              h('th', null, 'Required empty'),
            ),
          ),
          h(
            'tbody',
            null,
            ...history.map((e) =>
              h(
                'tr',
                null,
                h('td', null, new Date(e.at).toLocaleString()),
                h(
                  'td',
                  null,
                  h(
                    'a',
                    { href: e.url, target: '_blank', rel: 'noopener noreferrer', title: e.url },
                    e.title || e.host,
                  ),
                ),
                h('td', null, e.ats ?? '—'),
                h('td', null, String(e.filled)),
                h('td', { class: e.requiredMissing ? 'bad' : '' }, String(e.requiredMissing)),
              ),
            ),
          ),
        ),
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'secondary danger',
          on: {
            click: async () => {
              if (!confirm('Clear the application log?')) return;
              await store.clearHistory();
              renderSection(section);
            },
          },
        },
        'Clear log',
      ),
    );
  });
  return wrap;
}

function download(filename: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function renderData(): HTMLElement {
  const includeFiles = h('input', { type: 'checkbox', id: 'export-files' });
  const importPicker = h('input', {
    type: 'file',
    accept: 'application/json,.json',
    class: 'visually-hidden',
    id: 'import-file',
  });
  const message = h('p', { class: 'muted', attrs: { role: 'status' } });

  importPicker.addEventListener('change', async () => {
    const file = importPicker.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as Record<string, unknown>;
      if (!parsed || typeof parsed !== 'object' || !('profile' in parsed))
        throw new Error('This file is not a JobFill export.');
      if (!confirm('Replace your current profile and settings with the imported file?')) return;
      await store.saveProfile(normalizeProfile(parsed.profile));
      if (parsed.settings) await store.saveSettings(normalizeSettings(parsed.settings));
      const docs = parsed.documents as Documents | undefined;
      if (docs && typeof docs === 'object')
        await store.saveDocuments({ ...createEmptyDocuments(), ...docs });
      location.reload();
    } catch (err) {
      message.textContent = `Import failed: ${err instanceof Error ? err.message : String(err)}`;
    }
  });

  return h(
    'div',
    { class: 'data' },
    h(
      'p',
      { class: 'muted' },
      'Everything is stored locally in this browser profile (chrome.storage.local). Nothing is sent to any server.',
    ),
    h(
      'div',
      { class: 'data-actions' },
      h(
        'button',
        {
          type: 'button',
          class: 'secondary',
          on: {
            click: () => {
              const payload = {
                app: 'jobfill',
                exportedAt: new Date().toISOString(),
                profile: state.profile,
                settings: state.settings,
                ...(includeFiles.checked ? { documents } : {}),
              };
              download(
                `jobfill-profile-${new Date().toISOString().slice(0, 10)}.json`,
                JSON.stringify(payload, null, 2),
              );
            },
          },
        },
        'Export profile (JSON)',
      ),
      h('label', { class: 'inline' }, includeFiles, ' include resume & cover letter files'),
    ),
    h(
      'div',
      { class: 'data-actions' },
      h('label', { class: 'button secondary', htmlFor: 'import-file' }, 'Import profile…'),
      importPicker,
    ),
    h(
      'div',
      { class: 'data-actions' },
      h(
        'button',
        {
          type: 'button',
          class: 'secondary danger',
          on: {
            click: async () => {
              if (
                !confirm(
                  'Delete your profile, documents, settings and application log from this browser? This cannot be undone.',
                )
              )
                return;
              await store.clearAll();
              location.reload();
            },
          },
        },
        'Delete all my data',
      ),
    ),
    message,
  );
}

// ── Sections & layout ────────────────────────────────────────────────────────

function renderSection(section: SectionDef): void {
  const el = sectionEls.get(section.id);
  if (!el) return;
  clear(el);
  el.append(h('h2', null, section.title));
  if (section.description) el.append(h('p', { class: 'muted' }, section.description));
  if (section.custom === 'documents') el.append(renderDocuments(section));
  if (section.fields) el.append(renderFields(section.fields));
  if (section.list) el.append(renderList(section, section.list));
  if (section.custom === 'history') el.append(renderHistory(section));
  if (section.custom === 'data') el.append(renderData());
}

function renderProgress(): void {
  const percent = completenessPercent(state.profile, documents);
  const todo = profileChecklist(state.profile, documents).filter((i) => !i.done);
  clear(progressEl);
  progressEl.append(
    h(
      'div',
      { class: 'progress-top' },
      h('strong', null, `Profile ${percent}% complete`),
      statusEl,
    ),
    h('div', { class: 'bar' }, h('div', { style: `width:${percent}%` })),
    todo.length
      ? h(
          'div',
          { class: 'todo' },
          'Still missing: ',
          ...todo.flatMap((t, i) => [i ? ', ' : '', h('a', { href: `#${t.section}` }, t.label)]),
        )
      : h('div', { class: 'todo done' }, 'Your profile covers everything JobFill asks for.'),
  );
}

async function main(): Promise<void> {
  const data = await store.loadAll();
  state = { profile: data.profile, settings: data.settings };
  documents = data.documents;

  const app = document.getElementById('app')!;
  const nav = h(
    'nav',
    { attrs: { 'aria-label': 'Sections' } },
    h(
      'div',
      { class: 'logo' },
      h('img', { src: 'icons/icon-48.png', alt: '' }),
      h('span', null, 'JobFill'),
    ),
    ...SECTIONS.map((s) => h('a', { href: `#${s.id}` }, s.title)),
  );
  const main = h('main', null, progressEl);
  for (const s of SECTIONS) {
    const el = h('section', { id: s.id, class: 'card section' });
    sectionEls.set(s.id, el);
    main.append(el);
    renderSection(s);
  }
  main.append(
    h(
      'datalist',
      { id: 'degree-options' },
      ...DEGREE_SUGGESTIONS.map((d) => h('option', { value: d })),
    ),
  );
  clear(app);
  app.append(nav, main);
  setStatus(state.profile.updatedAt ? 'All changes saved' : 'Changes save automatically');
  renderProgress();

  if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();

  const links = new Map(
    Array.from(nav.querySelectorAll('a')).map((a) => [a.getAttribute('href')!.slice(1), a]),
  );
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        links.forEach((a) => a.classList.remove('active'));
        links.get(entry.target.id)?.classList.add('active');
      }
    },
    { rootMargin: '-20% 0px -70% 0px' },
  );
  sectionEls.forEach((el) => observer.observe(el));
}

void main();
