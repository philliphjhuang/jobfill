// End-to-end test: loads the built extension (dist/) into a real Chrome,
// seeds a profile, opens each demo form, clicks the floating Auto-Fill button
// and checks the page and the results panel.
//
//   npm run build && npm run test:e2e
//
// Uses CHROME_PATH if set, otherwise the standard Chrome install location.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
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
  await worker.evaluate(
    (p, d) => chrome.storage.local.set({ profile: p, documents: d }),
    profile,
    documents,
  );
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

  await check('Application log is recorded', async () => {
    const history = await worker.evaluate(
      async () => (await chrome.storage.local.get('history')).history,
    );
    assert.ok(history.length >= 4, `expected ≥4 entries, got ${history.length}`);
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
