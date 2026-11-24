import { build } from 'esbuild';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const libraries = ['pdf-lib', '@pdf-lib/standard-fonts', '@pdf-lib/upng', 'pako', 'tslib'];
async function notice(name) {
  const dir = 'node_modules/' + name + '/';
  const filename = (await readdir(new URL(dir, root)))
    .sort()
    .find((f) => /^licen[cs]e(\.(md|txt))?$/i.test(f));
  if (!filename) throw new Error('Missing license for ' + name);
  return name + '\n' + (await read(dir + filename)).replace(/\r\n?/g, '\n').trim();
}

const [template, css, ownLicense, credits, bundle] = await Promise.all([
  read('src/index.html'),
  read('src/style.css'),
  read('LICENSE'),
  Promise.all(libraries.map(notice)),
  build({
    absWorkingDir: fileURLToPath(root),
    entryPoints: ['src/app.mjs'],
    bundle: true,
    write: false,
    minify: true,
    format: 'iife',
    target: 'es2022',
    // Keep PDF cross-reference whitespace inside escaped strings across Git checkouts.
    supported: { 'template-literal': false },
    charset: 'utf8',
    legalComments: 'inline',
  }),
]);
const inline = (text) => text.replace(/<\/script/gi, '<\\/script');
const html = template
  .replace('/* STYLES */', () => css.trim())
  .replace('/* LICENSES */', () => inline([ownLicense.trim(), ...credits].join('\n\n')))
  .replace('/* APP */', () => inline(bundle.outputFiles[0].text.trim()));
await mkdir(new URL('docs/', root), { recursive: true });
await writeFile(new URL('docs/index.html', root), html);
console.log('Built docs/index.html (' + Buffer.byteLength(html).toLocaleString('en') + ' bytes).');
