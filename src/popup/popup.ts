import { completenessPercent, isProfileEmpty, profileChecklist } from '../shared/completeness';
import type { Message, RunResponse } from '../shared/messages';
import { Store } from '../shared/storage';
import { clear, h } from '../ui/h';

const store = new Store();
const app = document.getElementById('app')!;

function openOptions(hash?: string): void {
  void chrome.tabs.create({ url: chrome.runtime.getURL(`options.html${hash ? `#${hash}` : ''}`) });
  window.close();
}

async function activeTabId(): Promise<number | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}

async function render(): Promise<void> {
  const { profile, documents, settings } = await store.loadAll();
  const percent = completenessPercent(profile, documents);
  const todo = profileChecklist(profile, documents).filter((i) => !i.done);
  const name = [profile.personal.firstName, profile.personal.lastName].filter(Boolean).join(' ');

  const resultSlot = h('div');
  const fillBtn = h('button', { class: 'primary', type: 'button' }, 'Auto-Fill this page');

  fillBtn.addEventListener('click', async () => {
    const tabId = await activeTabId();
    if (tabId === undefined) return;
    fillBtn.disabled = true;
    fillBtn.textContent = 'Starting…';
    clear(resultSlot);
    const res = (await chrome.runtime.sendMessage({
      type: 'FILL_TAB',
      tabId,
    } satisfies Message)) as RunResponse;
    fillBtn.disabled = false;
    fillBtn.textContent = 'Auto-Fill this page';
    if (!res?.ok) {
      resultSlot.appendChild(h('div', { class: 'error' }, res?.error ?? 'Something went wrong.'));
      return;
    }
    const note = !res.started
      ? 'No application form found on this page.'
      : settings.pacing.enabled
        ? 'Filling started. JobFill types like a person, so this takes a few minutes. Progress, a Stop button and the results are shown on the page. You can close this popup.'
        : 'Filling started. The results are shown on the page.';
    resultSlot.appendChild(h('p', { class: 'muted', style: 'margin-top:10px' }, note));
  });

  clear(app);
  app.append(
    h(
      'header',
      null,
      h('img', { src: 'icons/icon-48.png', alt: '' }),
      h('div', null, h('h1', null, 'JobFill'), h('p', null, 'Job application autofill')),
    ),
    h(
      'section',
      null,
      h('div', { class: 'who' }, name || 'No profile yet'),
      h(
        'div',
        { class: 'muted' },
        profile.personal.email || 'Set up your profile to start auto-filling',
      ),
      h(
        'div',
        {
          class: 'bar',
          attrs: {
            role: 'progressbar',
            'aria-valuenow': String(percent),
            'aria-valuemin': '0',
            'aria-valuemax': '100',
          },
        },
        h('div', { style: `width:${percent}%` }),
      ),
      h(
        'div',
        { class: 'muted' },
        `Profile ${percent}% complete${documents.resume ? ` · Resume: ${documents.resume.name}` : ' · No resume uploaded'}`,
      ),
      isProfileEmpty(profile)
        ? h(
            'button',
            {
              type: 'button',
              class: 'secondary setup',
              on: { click: () => openOptions('import') },
            },
            'Set up my profile from my resume',
          )
        : null,
      todo.length
        ? h(
            'ul',
            { class: 'todo' },
            ...todo.slice(0, 3).map((i) =>
              h(
                'li',
                null,
                h(
                  'a',
                  {
                    href: '#',
                    on: {
                      click: (e: Event) => {
                        e.preventDefault();
                        openOptions(i.section);
                      },
                    },
                  },
                  i.label,
                ),
              ),
            ),
          )
        : null,
    ),
    h(
      'section',
      null,
      fillBtn,
      resultSlot,
      h(
        'div',
        { class: 'row' },
        h(
          'button',
          { class: 'secondary', type: 'button', on: { click: () => openOptions() } },
          'Edit profile',
        ),
        h(
          'button',
          { class: 'secondary', type: 'button', on: { click: () => openOptions('settings') } },
          'Settings',
        ),
      ),
    ),
    h(
      'footer',
      null,
      h('span', null, 'Data stays on this device'),
      h(
        'span',
        null,
        'Shortcut ',
        h('kbd', null, 'Alt'),
        '+',
        h('kbd', null, 'Shift'),
        '+',
        h('kbd', null, 'F'),
      ),
    ),
  );
}

void render();
