// @vitest-environment node
/**
 * Runs the real pdf.js text extraction (legacy Node build) on the sample PDF
 * and checks the full file → lines → profile-data path. The extension itself
 * uses the browser build; the e2e test covers that in Chrome.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { itemsToLines, type PdfTextItem } from '../../src/resume/extract';
import { parseResume } from '../../src/resume/parse';

async function extract(path: string) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(readFileSync(path)),
    isEvalSupported: false,
    useSystemFonts: false,
    verbosity: 0,
  }).promise;
  const page = await doc.getPage(1);
  const content = await page.getTextContent();
  const links = (await page.getAnnotations())
    .filter((a: { subtype: string; url?: string }) => a.subtype === 'Link' && a.url)
    .map((a: { url: string }) => a.url);
  const lines = itemsToLines(content.items.filter((i) => 'str' in i) as unknown as PdfTextItem[]);
  await doc.destroy();
  return { lines, links };
}

describe('PDF resume extraction (pdf.js)', () => {
  it('rebuilds lines with column gaps and reads link annotations', async () => {
    const { lines, links } = await extract(join(process.cwd(), 'demo', 'sample-resume.pdf'));
    expect(lines[0]).toBe('JORDAN AVERY RIVERA');
    expect(lines).toContain('Senior Software Engineer\tJan 2023 – Present');
    expect(lines).toContain('Bluebonnet Labs\tRemote');
    expect(lines).toContain('• Mentored four engineers.');
    expect(links).toEqual(['https://jordanrivera.dev/']); // pdf.js normalizes the URL
  });

  it('parses the sample PDF into profile data', async () => {
    const data = parseResume(await extract(join(process.cwd(), 'demo', 'sample-resume.pdf')));
    expect(data.personal).toMatchObject({
      firstName: 'Jordan',
      middleName: 'Avery',
      lastName: 'Rivera',
      phone: '(512) 555-0147',
    });
    expect(data.address).toMatchObject({ city: 'Austin', state: 'TX', postalCode: '78701' });
    expect(data.links).toMatchObject({
      linkedin: 'https://linkedin.com/in/jordanrivera',
      github: 'https://github.com/jrivera',
      portfolio: 'https://jordanrivera.dev',
    });
    expect(data.work.map((w) => [w.title, w.company, w.startDate, w.current])).toEqual([
      ['Senior Software Engineer', 'Lone Star Analytics', '2023-01', true],
      ['Software Engineer', 'Bluebonnet Labs', '2020-06', false],
    ]);
    expect(data.work[0]!.description).toContain('cutting load times by 40%.');
    expect(data.education[0]).toMatchObject({
      school: 'University of Texas at Austin',
      degree: 'Bachelor of Science',
      gpa: '3.8',
    });
  });
});
