// ============================================================
// check.js — Verificação estática (o projeto não tem build/lint)
//  • sintaxe de todos os .js (servidor e frontend)
//  • sintaxe dos <script> inline dos .html
//  • arquivos referenciados por <script src> / <link href> existem
// Uso: npm run check
// ============================================================
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const os = require('os');

const root = path.join(__dirname, '..');
let failed = 0;
const ok = m => console.log('  ✓', m);
const fail = m => { console.log('  ✗', m); failed++; };

function checkSyntax(file, label = file) {
  try { execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' }); ok(label); }
  catch (e) { fail(`${label}\n${e.stderr}`); }
}

console.log('JavaScript:');
for (const dir of ['server', 'js', 'test', 'scripts'])
  for (const f of fs.readdirSync(path.join(root, dir)).filter(f => f.endsWith('.js')))
    checkSyntax(path.join(root, dir, f), `${dir}/${f}`);

console.log('HTML:');
for (const f of fs.readdirSync(root).filter(f => f.endsWith('.html'))) {
  const html = fs.readFileSync(path.join(root, f), 'utf8');
  [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].forEach((m, i) => {
    const tmp = path.join(os.tmpdir(), `inline-${f}-${i}.js`);
    fs.writeFileSync(tmp, m[1]);
    checkSyntax(tmp, `${f} <script #${i + 1}>`);
  });
  for (const m of html.matchAll(/(?:src|href)="(\/(?:js|css)\/[^"]+)"/g)) {
    if (!fs.existsSync(path.join(root, m[1]))) fail(`${f} referencia ${m[1]}, que não existe`);
  }
}

console.log(failed ? `\n${failed} problema(s)` : '\nTudo certo');
process.exit(failed ? 1 : 0);
