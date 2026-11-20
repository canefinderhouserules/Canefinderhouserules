// Reworks the spell buttons of every generated monster page (docs/monsters/*/*.md) with tools/spell-rolls.js, without
// the saved Nethys pages: reads each stat block's data-r20, recomputes damage, healing, bonuses and duration at the
// block's caster level, adds the melee touch bonus, and writes the attribute back.
// Usage: node tools/update-spell-rolls.js
'use strict';
const fs = require('fs');
const path = require('path');
const { spellRoll } = require('./spell-rolls.js');

const MON = path.join(__dirname, '..', 'docs', 'monsters');
const dec = s => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const enc = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const FIELDS = ['damage', 'damageLabel', 'heal', 'touch', 'melee', 'rays', 'effect', 'duration'];
const mod = n => Math.floor((n - 10) / 2);

function update(m) {
  // melee touch = ranged touch with Strength (Dexterity with Weapon Finesse, or with no Strength) in place of Dexterity
  if (m.rangedTouch != null && m.abilities) {
    const score = k => { const x = m.abilities.match(new RegExp('\\b' + k + '\\s+([-–]?\\d+)')); return x ? +x[1].replace('–', '-') : null; };
    const dex = score('Dex') == null ? 10 : score('Dex');
    let str = score('Str'); if (str == null) str = dex;
    if (/Weapon Finesse/.test(m.feats || '')) str = Math.max(str, dex);
    m.meleeTouch = m.rangedTouch - mod(dex) + mod(str);
  }
  for (const b of m.spells || []) for (const l of b.levels) for (const s of l.spells) {
    if (!s.page) continue;
    for (const f of FIELDS) delete s[f];
    spellRoll(s, s.page, b.cl);
  }
  return m;
}

let files = 0, blocks = 0;
for (const d of fs.readdirSync(MON)) {
  const dir = path.join(MON, d);
  if (!fs.statSync(dir).isDirectory()) continue;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.md')) continue;
    const file = path.join(dir, f);
    const t = fs.readFileSync(file, 'utf8');
    if (t.indexOf('data-r20="') < 0) continue;
    const out = t.replace(/data-r20="([^"]*)"/g, (_, raw) => { blocks++; return 'data-r20="' + enc(JSON.stringify(update(JSON.parse(dec(raw))))) + '"'; });
    if (out !== t) { fs.writeFileSync(file, out); files++; }
  }
}
console.log(blocks + ' stat blocks, ' + files + ' pages changed');
