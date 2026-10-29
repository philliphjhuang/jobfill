import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  docxXmlToText,
  extractDocx,
  readZip,
  resumeKind,
  textToExtract,
} from '../../src/resume/extract';
import { parseResume } from '../../src/resume/parse';

const fixture = (name: string) => new Uint8Array(readFileSync(join(process.cwd(), 'demo', name)));

describe('resume file extraction', () => {
  it('detects supported file kinds', () => {
    expect(resumeKind('CV.PDF')).toBe('pdf');
    expect(resumeKind('resume.docx')).toBe('docx');
    expect(resumeKind('notes', 'text/plain')).toBe('txt');
    expect(resumeKind('resume.doc')).toBeNull();
    expect(resumeKind('photo.png', 'image/png')).toBeNull();
  });

  it('reads a .docx: paragraphs, bullets, table rows, tabs and hyperlinks', async () => {
    const { lines, links } = await extractDocx(fixture('sample-resume.docx'));
    expect(lines).toContain('Priya Natarajan');
    expect(lines).toContain('• Redesigned the checkout flow, lifting conversion by 12%.');
    expect(lines).toContain('Royal College of Art\t2016 – 2018');
    expect(lines).toContain('Figma\tPrototyping\tUser research');
    expect(links).toEqual(['https://www.linkedin.com/in/priyanatarajan']);
  });

  it('turns the .docx into profile data', async () => {
    const data = parseResume(await extractDocx(fixture('sample-resume.docx')));
    expect(data.personal).toMatchObject({
      firstName: 'Priya',
      lastName: 'Natarajan',
      phoneCountryCode: '+44',
    });
    expect(data.links.linkedin).toBe('https://www.linkedin.com/in/priyanatarajan');
    expect(data.work.map((w) => w.company)).toEqual(['Moonpig Ltd', 'Acme Studio']);
    expect(data.education[0]).toMatchObject({
      school: 'Royal College of Art',
      degree: 'Master of Arts',
      fieldOfStudy: 'Interaction Design',
      startDate: '2016-01',
      endDate: '2018-01',
    });
    expect(data.skills).toBe('Figma, Prototyping, User research');
  });

  it('rejects files that are not zip archives', () => {
    expect(() =>
      readZip(new TextEncoder().encode('not a zip at all, just some text here')),
    ).toThrow(/not a valid/);
  });

  it('handles line breaks inside a paragraph', () => {
    const xml =
      '<w:document xmlns:w="w"><w:body><w:p><w:r><w:t>Line one</w:t><w:br/><w:t>Line two</w:t></w:r></w:p></w:body></w:document>';
    expect(docxXmlToText(xml).lines).toEqual(['Line one', 'Line two']);
  });

  it('reads plain text', () => {
    expect(textToExtract('a\r\nb\nc').lines).toEqual(['a', 'b', 'c']);
  });
});
