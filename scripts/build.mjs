import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
const root = new URL('../', import.meta.url);
// Resolve/read with Node so restricted Windows runtimes need not enumerate ancestor directories.
const nodeFiles = { name: 'node-files', setup(builder) {
  builder.onResolve({ filter: /.*/ }, args => {
    const from = args.importer || fileURLToPath(new URL('package.json', root));
    const path = args.path.startsWith('.') ? resolve(dirname(from), args.path) : createRequire(from).resolve(args.path);
    return { path, namespace: 'node-files' };
  });
  builder.onLoad({ filter: /.*/, namespace: 'node-files' }, async args => ({ contents: await readFile(args.path, 'utf8'), loader: 'js' }));
} };
const result = await build({ entryPoints: ['./widget/sticker.mjs'], plugins: [nodeFiles], tsconfigRaw: {}, bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022', minify: true });
const template = await readFile(new URL('widget/sticker.html', root), 'utf8');
const html = template.replace('/* WIDGET_BUNDLE */', () => result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script'));
await mkdir(new URL('dist/', root), { recursive: true });
await writeFile(new URL('dist/sticker.html', root), html);
