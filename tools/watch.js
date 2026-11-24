// Local preview with live regeneration (used by docker-compose.yml / wiki.bat).
// Rebuilds every generated section once, starts `mkdocs serve`, then watches the pages that feed each
// generated section and re-runs only the builders that depend on what changed. mkdocs reloads the browser on its own.
// It polls file times instead of using file events, because events don't reach Docker from a Windows folder.
// Usage: node tools/watch.js
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const POLL_MS = 2000;

// Builders in the order they must run (enemy and Star Wars builders read the archetype output).
// `deps` are path prefixes relative to the repo root; a change under one of them re-runs that builder.
const BUILDERS = [
  { name: 'spells', script: 'tools/build-spells.js', deps: ['docs/magic/'] },
  { name: 'items', script: 'tools/build-items.js', deps: ['docs/magic-items/', 'docs/equipment/'] },
  { name: 'archetypes', script: 'tools/build-archetypes.js', deps: ['docs/characters/', 'tools/archetype-overrides.json'] },
  { name: 'enemy builder', script: 'tools/build-enemy-builder.js', after: 'archetypes',
    deps: ['docs/equipment/', 'docs/rules/', 'docs/monsters/', 'docs/characters/', 'docs/magic/', 'tools/spell-rolls.js'] },
  { name: 'Star Wars builder', script: 'tools/build-starwars-builder.js', after: 'archetypes',
    deps: ['docs/campaign-systems/', 'docs/characters/'] },
];

// What to watch: all of docs/ except the generated output in docs/tools/, plus the scripts in tools/.
const SKIP = new Set(['docs/tools']);
function scan(dir, out) {
  let entries;
  try { entries = fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const rel = dir + '/' + e.name;
    if (e.isDirectory()) { if (!SKIP.has(rel)) scan(rel, out); }
    else if (e.isFile()) { try { out.set(rel, fs.statSync(path.join(ROOT, rel)).mtimeMs); } catch { /* removed meanwhile */ } }
  }
  return out;
}
const snapshot = () => scan('tools', scan('docs', new Map()));

function changed(before, after) {
  const files = [];
  for (const [f, t] of after) if (before.get(f) !== t) files.push(f);
  for (const f of before.keys()) if (!after.has(f)) files.push(f);
  return files;
}

function run(builders) {
  for (const b of builders) {
    process.stdout.write(`[watch] building ${b.name}... `);
    const r = spawnSync('node', [b.script], { cwd: ROOT, encoding: 'utf8' });
    if (r.status === 0) console.log('ok');
    else console.log(`FAILED\n${(r.stderr || r.stdout || '').trim()}`);
  }
}

function pick(files) {
  const own = BUILDERS.filter(b => files.some(f =>
    b.deps.some(d => f.startsWith(d)) || f === b.script));
  // a change to any other script in tools/ (shared helpers) rebuilds everything
  if (files.some(f => f.startsWith('tools/') && f !== 'tools/watch.js' && !BUILDERS.some(b => b.deps.includes(f) || b.script === f))) return BUILDERS;
  const names = new Set(own.map(b => b.name));
  return BUILDERS.filter(b => names.has(b.name) || (b.after && names.has(b.after)));
}

console.log('[watch] generating all sections...');
run(BUILDERS);

const mkdocs = spawn('mkdocs', ['serve', '-a', '0.0.0.0:8000'], { cwd: ROOT, stdio: 'inherit' });
mkdocs.on('exit', code => process.exit(code || 0));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { mkdocs.kill(sig); process.exit(0); });

let last = snapshot();
console.log('[watch] watching pages for changes (the wiki is at http://localhost:8000)');
setInterval(() => {
  const now = snapshot();
  const files = changed(last, now);
  last = now;
  if (!files.length) return;
  const todo = pick(files);
  if (!todo.length) return;
  console.log(`[watch] changed: ${files.slice(0, 5).join(', ')}${files.length > 5 ? ` (+${files.length - 5} more)` : ''}`);
  run(todo); // the output in docs/tools/ isn't watched, so edits made while building show up on the next poll
}, POLL_MS);
