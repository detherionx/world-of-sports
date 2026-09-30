import fs from 'node:fs/promises';
const snapshot = JSON.parse(await fs.readFile('.private/bootstrap.json', 'utf8'));
const html = await fs.readFile('site/index.html', 'utf8');
const css = (await fs.readFile('site/style.css', 'utf8')).replaceAll(
  "url('/avatar.png')",
  `url('data:image/png;base64,${(await fs.readFile('public/avatar.png')).toString('base64')}')`,
);
const model = (await fs.readFile('site/model.js', 'utf8')).replaceAll('export ', '');
const app = (await fs.readFile('site/app.js', 'utf8')).replace(/^import[\s\S]*?;\n/m, '');
const safe = JSON.stringify(snapshot).replaceAll('<', '\\u003c');
const shim = `const initialSnapshot=${safe};window.fetch=async(url)=>new Response(JSON.stringify(url==='/api/state'?initialSnapshot:{error:'This is a private offline preview. Background synchronization requires the hosted app.'}),{status:url==='/api/state'?200:503,headers:{'Content-Type':'application/json'}});`;
const out = html
  .replace(/<link rel="stylesheet" href="\/style.css"\s*\/?>/, () => `<style>${css}</style>`)
  .replace(
    '<script type="module" src="/app.js"></script>',
    () => `<script type="module">${shim}\n${model}\n${app}</script>`,
  );
await fs.writeFile('.private/world-of-sports-preview.html', out);
console.log('Exported private offline preview. Contains personal data; never commit it.');
