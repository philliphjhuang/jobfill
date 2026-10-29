// End-to-end test: loads the built extension (dist/) into a real Chrome,
// seeds a profile, opens each demo form, clicks the floating Auto-Fill button
// and checks the page and the results panel.
//
//   npm run build && npm run test:e2e
//
// Uses CHROME_PATH if set, otherwise the standard Chrome install location.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';
import { startDemoServer } from '../../scripts/serve-demo.mjs';

const root = process.cwd();
const dist = join(root, 'dist');
const shots = process.env.E2E_SCREENSHOTS; // optional directory for screenshots

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];
  const found = candidates.find((p) => p && existsSync(p));
  if (!found) throw new Error('Chrome not found — set CHROME_PATH.');
  return found;
}

const profile = {
  schemaVersion: 1,
  personal: {
    firstName: 'Ada',
    middleName: '',
    lastName: 'Lovelace',
    preferredName: '',
    email: 'ada@example.com',
    phone: '(415) 555-0100',
    phoneCountryCode: '+1',
  },
  address: {
    line1: '1 Market St',
    line2: '',
    city: 'San Francisco',
    state: 'CA',
    postalCode: '94105',
    country: 'United States',
  },
  links: {
    linkedin: 'https://www.linkedin.com/in/ada',
    github: 'https://github.com/ada',
    portfolio: 'https://ada.dev',
    twitter: '',
    other: '',
  },
  work: [
    {
      id: 'w1',
      company: 'Analytical Engines Inc',
      title: 'Senior Software Engineer',
      location: 'San Francisco, CA',
      startDate: '2022-03',
      endDate: '',
      current: true,
      description: 'Led the platform team.',
    },
    {
      id: 'w2',
      company: 'Babbage Labs',
      title: 'Software Engineer',
      location: 'London, UK',
      startDate: '2019-06',
      endDate: '2022-02',
      current: false,
      description: 'Built compilers.',
    },
  ],
  education: [
    {
      id: 'e1',
      school: 'Stanford University',
      degree: "Master's Degree",
      fieldOfStudy: 'Mathematics',
      gpa: '4.0',
      startDate: '2019-09',
      endDate: '2021-06',
    },
  ],
  skills: '',
  languages: '',
  summary: '',
  coverLetter: 'Dear hiring team, I would love to join.',
  preferences: {
    preferredLocations: ['San Francisco, CA', 'Remote'],
    workArrangements: ['remote', 'hybrid'],
    willingToRelocate: 'yes',
    authorizedToWork: 'yes',
    requiresSponsorship: 'no',
    over18: 'yes',
    yearsOfExperience: '4',
    desiredSalary: '$150,000',
    noticePeriod: '',
    earliestStartDate: '2026-11-02',
    availability: '',
    howDidYouHear: 'LinkedIn',
    securityClearance: '',
    citizenship: 'United States',
  },
  eeo: {
    gender: 'female',
    pronouns: 'she/her',
    race: ['asian'],
    hispanicLatino: 'no',
    veteran: 'not_veteran',
    disability: 'no',
    sexualOrientation: '',
    transgender: '',
  },
  customAnswers: [{ id: 'c1', question: 'worked for', answer: 'No' }],
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const documents = {
  resume: {
    name: 'Ada_Lovelace_Resume.pdf',
    type: 'application/pdf',
    size: 13,
    data: Buffer.from('%PDF-1.4 test').toString('base64'),
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  coverLetter: null,
};

/** Page-side helpers evaluated in the demo page. */
const read = {
  value: (sel) => document.querySelector(sel)?.value ?? null,
  text: (sel) => document.querySelector(sel)?.textContent?.trim() ?? null,
  selected: (sel) => document.querySelector(sel)?.selectedOptions[0]?.textContent?.trim() ?? null,
  checked: (name) =>
    [...document.querySelectorAll(`input[name="${name}"]:checked`)].map((i) =>
      i.closest('label').textContent.replace(/\s+/g, ' ').trim(),
    ),
};

async function autofill(page, url) {
  await page.goto(url, { waitUntil: 'load' });
  const fab = await page.waitForSelector('pierce/.fab', { timeout: 15000 });
  const started = Date.now();
  await fab.click();
  await page.waitForFunction(
    () => !!document.getElementById('jobfill-host')?.shadowRoot?.querySelector('.stats'),
    { timeout: 60000, polling: 250 },
  );
  console.log(`    (filled in ${((Date.now() - started) / 1000).toFixed(1)}s)`);
  return page.evaluate(() => {
    const root = document.getElementById('jobfill-host').shadowRoot;
    return {
      stats: [...root.querySelectorAll('.stat b')].map((b) => Number(b.textContent)),
      required: [...root.querySelectorAll('.req li button span:first-child')].map(
        (s) => s.textContent,
      ),
    };
  });
}

const results = [];
async function check(name, fn) {
  try {
    await fn();
    results.push([name, 'ok']);
    console.log(`  ✓ ${name}`);
  } catch (err) {
    results.push([name, err]);
    console.log(`  ✗ ${name}\n    ${err.message.split('\n').join('\n    ')}`);
  }
}

if (!existsSync(join(dist, 'manifest.json'))) {
  console.error('dist/ is missing — run `npm run build` first.');
  process.exit(1);
}
if (shots) mkdirSync(shots, { recursive: true });

const { server, port } = await startDemoServer(0);
const base = `http://localhost:${port}`;
const browser = await puppeteer.launch({
  executablePath: findChrome(),
  headless: process.env.HEADFUL ? false : true,
  pipe: true,
  enableExtensions: [dist],
  args: [
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1280,900',
    // Ubuntu CI runners restrict the user namespaces Chrome's sandbox needs.
    ...(process.env.CI ? ['--no-sandbox'] : []),
  ],
  defaultViewport: { width: 1280, height: 900 },
});

try {
  const workerTarget = await browser.waitForTarget(
    (t) => t.type() === 'service_worker' && t.url().endsWith('/background.js'),
    { timeout: 15000 },
  );
  const extensionId = new URL(workerTarget.url()).host;
  const worker = await workerTarget.worker();
  // The form checks fill instantly; pacing gets its own checks below.
  const setPacing = (pacing) =>
    worker.evaluate((pc) => chrome.storage.local.set({ settings: { pacing: pc } }), pacing);
  await worker.evaluate(
    (p, d) => chrome.storage.local.set({ profile: p, documents: d }),
    profile,
    documents,
  );
  await setPacing({
    enabled: false,
    keyMinSec: 0.1,
    keyMaxSec: 0.9,
    fieldMinSec: 3,
    fieldMaxSec: 7,
  });
  // Close the options tab opened on install.
  for (const p of await browser.pages())
    if (p.url().startsWith('chrome-extension://')) await p.close();

  const page = await browser.newPage();
  console.log(`JobFill e2e — Chrome ${await browser.version()}, extension ${extensionId}`);

  await check('Greenhouse-style form', async () => {
    const panel = await autofill(page, `${base}/greenhouse-style.html`);
    assert.equal(await page.evaluate(read.value, '#first_name'), 'Ada');
    assert.equal(await page.evaluate(read.value, '#email'), 'ada@example.com');
    assert.equal(
      await page.evaluate(read.value, 'input[name="location"]'),
      'San Francisco, California, United States',
    );
    assert.equal(
      await page.evaluate(() => document.getElementById('resume').files[0]?.name),
      'Ada_Lovelace_Resume.pdf',
    );
    assert.equal(await page.evaluate(read.value, 'input[name="question_auth"]'), 'Yes');
    assert.equal(await page.evaluate(read.selected, '#question_visa'), 'No');
    assert.equal(await page.evaluate(read.value, 'input[name="school--0"]'), 'Stanford University');
    assert.equal(await page.evaluate(read.selected, '#race'), 'Asian');
    assert.equal(
      await page.evaluate(read.selected, '#veteran_status'),
      'I am not a protected veteran',
    );
    assert.deepEqual(panel.required, ['Why are you interested in joining our team?']);
    if (shots) await page.screenshot({ path: join(shots, 'greenhouse.png'), fullPage: false });
  });

  await check('Lever-style form', async () => {
    const panel = await autofill(page, `${base}/lever-style.html`);
    assert.equal(await page.evaluate(read.value, 'input[name="name"]'), 'Ada Lovelace');
    assert.equal(
      await page.evaluate(read.value, 'input[name="urls[GitHub]"]'),
      'https://github.com/ada',
    );
    assert.deepEqual(await page.evaluate(read.checked, 'cards[q1][field0]'), ['Yes']);
    assert.deepEqual(await page.evaluate(read.checked, 'cards[q2][field0]'), [
      'San Francisco',
      'Remote (US)',
    ]);
    assert.equal(await page.evaluate(read.selected, 'select[name="cards[q3][field0]"]'), '3-5');
    assert.deepEqual(await page.evaluate(read.checked, 'cards[q4][field0]'), ['No']);
    assert.equal(panel.required.length, 1);
    if (shots) await page.screenshot({ path: join(shots, 'lever.png') });
  });

  await check('Workday-style form', async () => {
    const panel = await autofill(page, `${base}/workday-style.html`);
    assert.equal(await page.evaluate(read.text, '#country-btn'), 'United States of America');
    assert.equal(await page.evaluate(read.text, '#state-btn'), 'California');
    assert.equal(
      await page.evaluate(() => document.querySelectorAll('#work-entries .entry').length),
      2,
    );
    assert.equal(await page.evaluate(read.value, '#company-1'), 'Analytical Engines Inc');
    assert.equal(await page.evaluate(read.value, '#from-year-2'), '2019');
    assert.equal(await page.evaluate(read.value, '#school-1'), 'Stanford University');
    assert.equal(await page.evaluate(read.text, '#eth-btn'), 'Asian (United States of America)');
    assert.deepEqual(panel.required, ['I have read and consent to the terms and conditions']);
    if (shots) await page.screenshot({ path: join(shots, 'workday.png') });
  });

  await check('Custom careers page (shadow DOM, ranges, custom answers)', async () => {
    const panel = await autofill(page, `${base}/generic.html`);
    assert.equal(await page.evaluate(read.value, 'input[name="fname"]'), 'Ada');
    assert.equal(
      await page.evaluate(
        () => document.querySelector('pronoun-field').shadowRoot.querySelector('input').value,
      ),
      'she/her',
    );
    assert.equal(await page.evaluate(read.selected, '#yoe'), '3-5 years');
    assert.deepEqual(await page.evaluate(read.checked, 'prev'), ['No']);
    assert.equal(await page.evaluate(read.value, 'input[name="newsletter"]'), '');
    assert.deepEqual(panel.required, [
      'Why do you want to join Globex?',
      'I consent to Globex storing my application data',
    ]);
    if (shots) await page.screenshot({ path: join(shots, 'generic.png') });
  });

  await check('Clicking a missing field scrolls to and focuses it', async () => {
    await page.evaluate(() => {
      const root = document.getElementById('jobfill-host').shadowRoot;
      root.querySelector('.req li button').click();
    });
    await page.waitForFunction(() => document.activeElement?.id === 'why', { timeout: 5000 });
  });

  const panelText = (selector) =>
    page.evaluate(
      (sel) =>
        document.getElementById('jobfill-host')?.shadowRoot?.querySelector(sel)?.textContent ?? '',
      selector,
    );

  await check('Types like a person: one character at a time, pausing between fields', async () => {
    await setPacing({
      enabled: true,
      keyMinSec: 0.01,
      keyMaxSec: 0.03,
      fieldMinSec: 0.3,
      fieldMaxSec: 0.5,
    });
    await page.goto(`${base}/lever-style.html`, { waitUntil: 'load' });
    await page.evaluate(() => {
      window.__typed = [];
      document
        .querySelector('input[name="name"]')
        .addEventListener('input', (e) => window.__typed.push(e.target.value));
    });
    const fab = await page.waitForSelector('pierce/.fab', { timeout: 15000 });
    const started = Date.now();
    await fab.click();
    // The panel shows live progress while it types.
    await page.waitForFunction(
      () =>
        /Field \d+ of \d+/.test(
          document.getElementById('jobfill-host')?.shadowRoot?.querySelector('.run-title')
            ?.textContent ?? '',
        ),
      { timeout: 15000, polling: 50 },
    );
    if (shots) await page.screenshot({ path: join(shots, 'paced-progress.png') });
    await page.waitForFunction(
      () => !!document.getElementById('jobfill-host')?.shadowRoot?.querySelector('.stats'),
      { timeout: 120000, polling: 250 },
    );
    const seconds = (Date.now() - started) / 1000;
    console.log(`    (paced fill took ${seconds.toFixed(1)}s with shortened test delays)`);
    const typed = await page.evaluate(() => window.__typed);
    assert.deepEqual(
      typed,
      Array.from('Ada Lovelace', (_, i) => 'Ada Lovelace'.slice(0, i + 1)),
    );
    assert.equal(
      await page.evaluate(read.value, 'input[name="urls[GitHub]"]'),
      'https://github.com/ada',
    );
    assert.equal(await page.evaluate(read.selected, 'select[name="cards[q3][field0]"]'), '3-5');
    // ~15 fields with ≥ 0.3 s between them, plus ~150 characters.
    assert.ok(seconds > 4, `took only ${seconds}s — were the pauses applied?`);
  });

  await check('Stop finishes the current field and reports what is left', async () => {
    await setPacing({
      enabled: true,
      keyMinSec: 0.02,
      keyMaxSec: 0.05,
      fieldMinSec: 1.5,
      fieldMaxSec: 2,
    });
    await page.goto(`${base}/generic.html`, { waitUntil: 'load' });
    const fab = await page.waitForSelector('pierce/.fab', { timeout: 15000 });
    await fab.click();
    // Let two fields go by, then press Stop in the panel.
    await page.waitForFunction(
      () =>
        /Field [3-9] of/.test(
          document.getElementById('jobfill-host')?.shadowRoot?.querySelector('.run-title')
            ?.textContent ?? '',
        ),
      { timeout: 30000, polling: 50 },
    );
    await page.evaluate(() =>
      document.getElementById('jobfill-host').shadowRoot.querySelector('.btn.stop').click(),
    );
    await page.waitForFunction(
      () => !!document.getElementById('jobfill-host')?.shadowRoot?.querySelector('.stats'),
      { timeout: 20000, polling: 100 },
    );
    assert.match(await panelText('.note'), /^Stopped\./);
    assert.equal(await page.evaluate(read.value, 'input[name="fname"]'), 'Ada');
    assert.equal(await page.evaluate(read.value, 'input[name="lname"]'), 'Lovelace');
    assert.equal(await page.evaluate(read.value, '#zip'), ''); // left for the user
    if (shots) await page.screenshot({ path: join(shots, 'paced-stopped.png') });
    await setPacing({
      enabled: false,
      keyMinSec: 0.1,
      keyMaxSec: 0.9,
      fieldMinSec: 3,
      fieldMaxSec: 7,
    });
  });

  await check('Application log is recorded', async () => {
    const history = await worker.evaluate(
      async () => (await chrome.storage.local.get('history')).history,
    );
    assert.ok(history.length >= 4, `expected ≥4 entries, got ${history.length}`);
  });

  await check('Fill profile from a PDF resume (Yes / Edit prompts)', async () => {
    // Existing profile: some fields match the resume, some differ, most are empty.
    await worker.evaluate(() =>
      chrome.storage.local.set({
        profile: {
          personal: { firstName: 'Jordan', email: 'old@example.com' },
          skills: 'Go',
          work: [
            {
              id: 'w-existing',
              company: 'Lone Star Analytics',
              title: 'Engineer',
              location: '',
              startDate: '',
              endDate: '',
              current: false,
              description: '',
            },
          ],
        },
        documents: { resume: null, coverLetter: null },
      }),
    );
    const options = await browser.newPage();
    await options.goto(`chrome-extension://${extensionId}/options.html#import`);
    const picker = await options.waitForSelector('#resume-import-file');
    await picker.uploadFile(join(root, 'demo', 'sample-resume.pdf'));
    await options.waitForSelector('dialog.import-dialog[open]', { timeout: 20000 });

    const labels = await options.$$eval('.conflict .conflict-label', (els) =>
      els.map((e) => e.textContent),
    );
    assert.deepEqual(labels, [
      'Email',
      'Skills',
      'Work · Lone Star Analytics — Job title',
      'Work · Lone Star Analytics — Currently work here',
    ]);
    if (shots) await options.screenshot({ path: join(shots, 'resume-review.png') });

    // Email → Yes; job title → Edit; skills and "current" left unanswered (kept).
    await options.click('.conflict:nth-child(1) button.yes');
    await options.click('.conflict:nth-child(3) button.edit');
    await options.$eval('.conflict:nth-child(3) .editor input', (el) => {
      el.value = 'Principal Engineer';
    });
    await options.click('.conflict:nth-child(3) .editor button.primary');
    if (shots) await options.screenshot({ path: join(shots, 'resume-review-answered.png') });
    await options.click('.import-dialog footer button.primary');
    await options.waitForSelector('.import-status.done');

    await options.waitForFunction(
      () =>
        new Promise((resolve) =>
          chrome.storage.local.get('profile', ({ profile }) =>
            resolve(profile?.work?.[0]?.title === 'Principal Engineer'),
          ),
        ),
      { timeout: 5000, polling: 200 },
    );
    const saved = await worker.evaluate(() => chrome.storage.local.get(['profile', 'documents']));
    const p = saved.profile;
    assert.equal(p.personal.email, 'jordan.rivera@example.com'); // Yes
    assert.equal(p.skills, 'Go'); // not answered → kept
    assert.equal(p.work[0].title, 'Principal Engineer'); // Edit
    assert.equal(p.work[0].current, false); // not answered → kept
    assert.equal(p.work[0].startDate, '2023-01'); // was empty → filled
    assert.equal(p.personal.lastName, 'Rivera'); // was empty → filled
    assert.equal(p.links.portfolio, 'https://jordanrivera.dev');
    assert.equal(p.work.length, 2); // Bluebonnet Labs added
    assert.equal(saved.documents.resume.name, 'sample-resume.pdf');
    // The stored copy must be the whole file (pdf.js must not have consumed the bytes).
    const original = readFileSync(join(root, 'demo', 'sample-resume.pdf'));
    assert.equal(saved.documents.resume.size, original.length);
    assert.equal(saved.documents.resume.data, original.toString('base64'));
    await options.close();
  });

  if (shots) {
    const options = await browser.newPage();
    await options.goto(`chrome-extension://${extensionId}/options.html`);
    await options.waitForSelector('.progress-card strong');
    await options.screenshot({ path: join(shots, 'options.png') });
    const popup = await browser.newPage();
    await popup.setViewport({ width: 360, height: 520 });
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await popup.waitForSelector('.primary');
    await popup.screenshot({ path: join(shots, 'popup.png') });
  }
} finally {
  await browser.close();
  server.close();
}

const failed = results.filter(([, r]) => r !== 'ok');
console.log(`\n${results.length - failed.length}/${results.length} e2e checks passed`);
process.exit(failed.length ? 1 : 0);
