import fs from 'node:fs/promises';
// Embeds the interface and avatar atlas as a module the Worker imports (wrangler bundles it).
await fs.mkdir('dist', { recursive: true });
const assets = {};
for (const [file, type] of Object.entries({
  'index.html': 'text/html; charset=utf-8',
  'app.js': 'text/javascript; charset=utf-8',
  'model.js': 'text/javascript; charset=utf-8',
  'style.css': 'text/css; charset=utf-8',
  'favicon.svg': 'image/svg+xml',
}))
  assets['/' + file] = { body: await fs.readFile('site/' + file, 'utf8'), type };
const avatar = (await fs.readFile('public/avatar.png')).toString('base64');
await fs.writeFile(
  'dist/assets.js',
  `export const ASSETS=${JSON.stringify(assets)};\nASSETS['/avatar.png']={body:Uint8Array.from(atob(${JSON.stringify(avatar)}),c=>c.charCodeAt(0)),type:'image/png'};\n`,
);
console.log('Built interface and character assets.');
