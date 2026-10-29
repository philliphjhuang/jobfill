// Bundles the extension into dist/ with esbuild. `--watch` rebuilds on change.
import { build, context } from 'esbuild';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync, watch as fsWatch } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const watchMode = process.argv.includes('--watch');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

const entryPoints = {
  background: 'src/background/service-worker.ts',
  content: 'src/content/index.ts',
  popup: 'src/popup/popup.ts',
  options: 'src/options/options.ts',
};

const STATIC = [
  ['src/popup/popup.html', 'popup.html'],
  ['src/popup/popup.css', 'popup.css'],
  ['src/options/options.html', 'options.html'],
  ['src/options/options.css', 'options.css'],
  ['public/icons', 'icons'],
  // pdf.js parses resumes in a worker (options page only).
  ['node_modules/pdfjs-dist/build/pdf.worker.min.mjs', 'pdf.worker.min.mjs'],
];

function copyStatic() {
  for (const [from, to] of STATIC) cpSync(join(root, from), join(dist, to), { recursive: true });
  const manifest = JSON.parse(readFileSync(join(root, 'public/manifest.json'), 'utf8'));
  manifest.version = pkg.version;
  writeFileSync(join(dist, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

const options = {
  entryPoints,
  outdir: dist,
  bundle: true,
  format: 'iife',
  target: ['chrome110'],
  platform: 'browser',
  sourcemap: watchMode ? 'inline' : false,
  minify: !watchMode,
  legalComments: 'none',
  logLevel: 'info',
};

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

if (watchMode) {
  const ctx = await context(options);
  await ctx.watch();
  copyStatic();
  for (const dir of ['src/popup', 'src/options', 'public']) {
    fsWatch(join(root, dir), { recursive: true }, () => {
      try {
        copyStatic();
      } catch (err) {
        console.error(err);
      }
    });
  }
  console.log('Watching for changes… load dist/ as an unpacked extension.');
} else {
  await build(options);
  copyStatic();
  console.log(`Built JobFill v${pkg.version} → dist/`);
}
