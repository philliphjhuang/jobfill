// Generates demo/sample-resume.pdf and demo/sample-resume.docx — fictional
// resumes used by the resume-import tests and for trying the feature.
//   node scripts/make-sample-resumes.mjs
import { writeFileSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';

// ── PDF ──────────────────────────────────────────────────────────────────────

const WIN_ANSI = { '•': 0x95, '–': 0x96, '—': 0x97 };

function pdfText(s) {
  const bytes = [];
  for (const ch of s) {
    const code = WIN_ANSI[ch] ?? ch.charCodeAt(0);
    if (code === 0x28 || code === 0x29 || code === 0x5c) bytes.push(0x5c);
    bytes.push(code);
  }
  return Buffer.from(bytes);
}

function makePdf() {
  const segments = [];
  let y = 740;
  const line = (text, { x = 72, font = 'F1', size = 10, right, rightX = 470, gap = 14 } = {}) => {
    segments.push({ text, x, y, font, size });
    if (right) segments.push({ text: right, x: rightX, y, font: 'F1', size });
    y -= gap;
  };
  line('JORDAN AVERY RIVERA', { font: 'F2', size: 16, gap: 18 });
  line(
    'Austin, TX 78701 | (512) 555-0147 | jordan.rivera@example.com | linkedin.com/in/jordanrivera | github.com/jrivera',
    { size: 8.5 },
  );
  const portfolioY = y;
  line('Portfolio', { size: 8.5, gap: 20 });
  line('SUMMARY', { font: 'F2', size: 11 });
  line('Full-stack engineer with 5 years of experience building data-heavy web applications.', {
    gap: 20,
  });
  line('EXPERIENCE', { font: 'F2', size: 11 });
  line('Senior Software Engineer', { font: 'F2', right: 'Jan 2023 – Present' });
  line('Lone Star Analytics, Austin, TX');
  line('• Led migration of the reporting stack to TypeScript and React, cutting load', { x: 80 });
  line('times by 40%.', { x: 88 });
  line('• Mentored four engineers.', { x: 80, gap: 18 });
  line('Software Engineer', { font: 'F2', right: 'Jun 2020 – Dec 2022' });
  line('Bluebonnet Labs', { right: 'Remote', rightX: 505 });
  line('• Built ETL pipelines in Python processing 2M events per day.', { x: 80, gap: 20 });
  line('EDUCATION', { font: 'F2', size: 11 });
  line('University of Texas at Austin', { font: 'F2', right: 'Austin, TX', rightX: 490 });
  line('B.S. in Computer Science, GPA: 3.8', { right: 'Aug 2016 – May 2020', gap: 20 });
  line('SKILLS', { font: 'F2', size: 11 });
  line('Languages: TypeScript, Python, SQL, Go');
  line('Frameworks: React, Node.js, Django');

  const content = Buffer.concat(
    segments.flatMap((s) => [
      Buffer.from(`BT /${s.font} ${s.size} Tf 1 0 0 1 ${s.x} ${s.y} Tm (`),
      pdfText(s.text),
      Buffer.from(') Tj ET\n'),
    ]),
  );
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R /Annots [7 0 R] >>',
    Buffer.concat([
      Buffer.from(`<< /Length ${content.length} >>\nstream\n`),
      content,
      Buffer.from('\nendstream'),
    ]),
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    `<< /Type /Annot /Subtype /Link /Rect [70 ${portfolioY - 2} 112 ${portfolioY + 9}] /Border [0 0 0] /A << /S /URI /URI (https://jordanrivera.dev) >> >>`,
  ];
  const chunks = [Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
  const offsets = [];
  let length = chunks[0].length;
  objects.forEach((obj, i) => {
    offsets.push(length);
    const body = Buffer.concat([
      Buffer.from(`${i + 1} 0 obj\n`),
      Buffer.isBuffer(obj) ? obj : Buffer.from(obj),
      Buffer.from('\nendobj\n'),
    ]);
    chunks.push(body);
    length += body.length;
  });
  const xref = [
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`,
    ...offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`),
  ].join('');
  chunks.push(
    Buffer.from(
      `${xref}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${length}\n%%EOF\n`,
    ),
  );
  return Buffer.concat(chunks);
}

// ── DOCX ─────────────────────────────────────────────────────────────────────

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Minimal ZIP writer (deflate). */
export function zip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const data = Buffer.from(text, 'utf8');
    const packed = deflateRawSync(data);
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    locals.push(local, nameBuf, packed);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + packed.length;
  }
  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuf, end]);
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const run = (text) => `<w:r><w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
const para = (...runs) => `<w:p>${runs.join('')}</w:p>`;
const bullet = (text) =>
  `<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>${run(text)}</w:p>`;
const row = (...cells) =>
  `<w:tr>${cells.map((c) => `<w:tc><w:p>${run(c)}</w:p></w:tc>`).join('')}</w:tr>`;

function makeDocx() {
  const body = [
    para(run('Priya Natarajan')),
    para(
      run('priya.n@example.org · +44 20 7946 0958 · London, UK · '),
      '<w:hyperlink r:id="rIdLinkedIn">',
      run('LinkedIn'),
      '</w:hyperlink>',
    ),
    para(run('Professional Experience')),
    para(run('Moonpig Ltd — London, UK')),
    para(run('Product Designer, March 2021 – Present')),
    bullet('Redesigned the checkout flow, lifting conversion by 12%.'),
    para(run('Acme Studio — Brighton, UK')),
    para(run('Junior Designer, Sept 2018 – Feb 2021')),
    bullet('Built the design system.'),
    para(run('Education')),
    `<w:tbl>${row('Royal College of Art', '2016 – 2018')}</w:tbl>`,
    para(run('Master of Arts in Interaction Design')),
    para(run('Skills')),
    para(
      run('Figma'),
      '<w:r><w:tab/></w:r>',
      run('Prototyping'),
      '<w:r><w:tab/></w:r>',
      run('User research'),
    ),
  ].join('');
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  return zip({
    '[Content_Types].xml':
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/></Types>',
    '_rels/.rels':
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    'word/_rels/document.xml.rels':
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdNumbering" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/><Relationship Id="rIdLinkedIn" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://www.linkedin.com/in/priyanatarajan" TargetMode="External"/></Relationships>',
    'word/numbering.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering xmlns:w="${W}"><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`,
    'word/document.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${W}" xmlns:r="${R}"><w:body>${body}</w:body></w:document>`,
  });
}

writeFileSync('demo/sample-resume.pdf', makePdf());
writeFileSync('demo/sample-resume.docx', makeDocx());
console.log('Wrote demo/sample-resume.pdf and demo/sample-resume.docx');
