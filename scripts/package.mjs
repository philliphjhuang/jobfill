// Zips dist/ into release/jobfill-v<version>.zip for the Chrome Web Store.
import AdmZip from 'adm-zip';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

if (!existsSync(join(dist, 'manifest.json'))) {
  console.error('dist/ is missing — run `npm run build` first.');
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(join(dist, 'manifest.json'), 'utf8'));
if (manifest.version !== version) {
  console.error(`manifest version ${manifest.version} does not match package.json ${version}`);
  process.exit(1);
}

mkdirSync(join(root, 'release'), { recursive: true });
const out = join(root, 'release', `jobfill-v${version}.zip`);
const zip = new AdmZip();
zip.addLocalFolder(dist);
zip.writeZip(out);
console.log(`Packaged ${out}`);
