// Converts saved d20pfsrd bestiary pages into the Archives of Nethys layout that tools/build-monsters.js reads.
// Each stat block becomes <h2 class="title">Name CR x</h2> with a Source line "3PP: product" (third-party) or
// "PZO: product" (Paizo). Paizo creatures already on the wiki (matched by name) and Spheres content are left out.
// Usage: node tools/convert-pfsrd.js <dir with pages/*.html> <out dir>
'use strict';
const fs = require('fs');
const path = require('path');

const MON = path.join(__dirname, '..', 'docs', 'monsters');
// word order ignored: "Black Dragon, Juvenile" = "Juvenile Black Dragon"
const norm = s => String(s).toLowerCase().replace(/&#8217;|’/g, "'").replace(/\(.*?\)/g, '').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').sort().join(' ');

// names already on the wiki, from the generated index tables
const ordered = [];
function existingNames() {
  const names = new Set();
  for (const d of fs.readdirSync(MON)) {
    if (d === 'third-party' || d === 'more-creatures') continue; // this script's own output
    const idx = path.join(MON, d, 'index.md');
    if (!fs.existsSync(idx)) continue;
    for (const m of fs.readFileSync(idx, 'utf8').matchAll(/^\| \[([^\]]+)\]/gm)) {
      names.add(norm(m[1]));
      // "Brigand (Bandit Lord)" is also known as "Bandit Lord"; "Bearded Devil (Barbazu)" as "Barbazu"
      const p = m[1].match(/\(([^)]+)\)/); if (p) { names.add(norm(p[1])); names.add(norm(m[1].replace(/[()]/g, ' '))); }
      // "Orania, Cloud Giant Oligarch" is also "Cloud Giant Oligarch"
      if (/,/.test(m[1])) names.add(norm(m[1].split(',').slice(1).join(' ')));
      // keep the plain word order too, for "Academy Performer" inside "Kitharodian Academy Performer"
      ordered.push(m[1].toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]+/g, ' ').trim());
    }
  }
  return names;
}

const decode = s => s.replace(/&#8217;/g, '’').replace(/&#8211;/g, '–').replace(/&#8212;/g, '—').replace(/&#215;/g, '×');

function linkFix(h) {
  return h
    .replace(/<a [^>]*href="[^"]*\/magic\/all-spells\/[^"]*"[^>]*>([\s\S]*?)<\/a>/g, (_, t) => '<a href="SpellDisplay.aspx?ItemName=' + t.replace(/<[^>]+>/g, '').trim() + '">' + t + '</a>')
    .replace(/<a [^>]*href="[^"]*\/feats\/[^"]*"[^>]*>([\s\S]*?)<\/a>/g, (_, t) => '<a href="FeatDisplay.aspx?ItemName=' + t.replace(/<[^>]+>/g, '').trim() + '">' + t + '</a>')
    .replace(/<a [^>]*>([\s\S]*?)<\/a>/g, '$1');
}

function convertBlock(seg, source) {
  let h = seg;
  h = h.replace(/<div class="product-right">[\s\S]*?<\/div>\s*<\/div>/g, '');
  h = h.replace(/<p class="description">[\s\S]*?<\/p>/g, '');
  h = h.replace(/<script[\s\S]*?<\/script>|<!--[\s\S]*?-->|<div[^>]*>|<\/div>/g, '');
  // spell levels written as a bulleted list
  h = h.replace(/<li[^>]*>([\s\S]*?)<\/li>/g, '<p>$1</p>').replace(/<\/?[uo]l[^>]*>/g, '');
  // the title paragraph is not always closed before the XP line: keep "Name CR x" and leave the rest in place
  const FR = { '½': '1/2', '⅓': '1/3', '¼': '1/4', '⅛': '1/8', '⅙': '1/6' };
  const tm = h.match(/<p class="title">((?:(?!<\/p>)[\s\S])*?)CR(?:\s|&nbsp;|&#160;| )*(?:<[^>]*>\s*)*([\d\/½⅓¼⅛⅙—–-]+(?:\s*\/\s*MR\s*\d+)?)(?:\s*<\/span>)?(?:\s*<\/p>)?/);
  const title = tm ? tm[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() + ' CR ' + tm[2].replace(/[½⅓¼⅛⅙]/g, c => FR[c]) : 'Unknown';
  if (tm) h = h.replace(tm[0], '<p>').replace(/<p>\s*<\/p>/, '');
  // special abilities: <h4>Name (Ex)</h4><p>text</p> -> <b>Name (Ex)</b> text
  h = h.replace(/<h[4-6][^>]*>([\s\S]*?)<\/h[4-6]>\s*<p[^>]*>([\s\S]*?)<\/p>/g, (_, n, t) => '<p><b>' + n.replace(/<[^>]+>/g, '').trim() + '</b> ' + t + '</p>');
  h = h.replace(/<p class="divider">\s*([\s\S]*?)\s*<\/p>/g, (_, t) => {
    const s = t.replace(/<[^>]+>/g, '').trim().toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
    return '<h3 class="framing">' + s + '</h3>';
  });
  // plain paragraphs after the stat lines start the description
  let seenStats = false, desc = false;
  h = h.replace(/<h3 class="framing">([^<]*)<\/h3>|<p[^>]*>([\s\S]*?)<\/p>/g, (all, head, body) => {
    if (head !== undefined) { if (/Statistics/i.test(head)) seenStats = true; return desc ? '' : all; }
    if (desc) return body + '<br /><br />';
    if (seenStats && !/^\s*<b>/.test(body)) { desc = true; return '<h3 class="framing">Description</h3>' + body + '<br /><br />'; }
    return body + '<br />';
  });
  h = h.replace(/<b>XP\s*([\d,]+)\s*<\/b>/, '<b>XP</b> $1').replace(/<b>Base<\/b>\s*<b>Atk<\/b>/g, '<b>Base Atk</b>');
  // spell-list labels: "<b>At will</b>—" -> "At will—"
  // (em dash, en dash, or the dash inside the bold: "<b>At Will—</b>")
  h = h.replace(/<b>([^<]{1,45}?)\s*(?:—|&#8212;|–|&#8211;)\s*<\/b>/g, '$1—');
  h = h.replace(/<b>([^<]{1,45})<\/b>\s*(?:—|&#8212;|–|&#8211;)/g, '$1—');
  h = linkFix(decode(h));
  return '<h2 class="title">' + title + '</h2><b>Source</b> <a><i>' + source + ' pg. 0</i></a><br />' + h;
}

if (require.main === module) {
  const [dir, out] = process.argv.slice(2);
  fs.mkdirSync(path.join(out, 'pages'), { recursive: true });
  const have = existingNames();
  // a d20pfsrd name matches with or without its parenthetical: "Brown Bear (or Grizzly...)" / "Werewolf (Hybrid Form)"
  // the wiki's names have Golarion terms replaced ("Varisian Hagfish" is "Frontier Hagfish" there)
  const { scrubNames } = require('./build-monsters.js');
  const ends = x => { const w = x.toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); return w.split(' ').length >= 2 && ordered.some(o => o === w || o.endsWith(' ' + w)); };
  const seen = n => [n, scrubNames(n)].some(x => have.has(norm(x)) || have.has(norm(x.replace(/[()]/g, ' '))) || ends(x));
  let thirdParty = 0, paizo = 0, skipped = 0, spheres = 0;
  for (const f of fs.readdirSync(path.join(dir, 'pages'))) {
    const page = fs.readFileSync(path.join(dir, 'pages', f), 'utf8');
    const at = page.indexOf('class="section15"');
    const s15 = at >= 0 ? page.slice(at, at + 3000).replace(/^[^>]*>/, '').split(/<!--div|<\/article>/)[0] : '';
    const lines = decode(s15.replace(/<\/p>|<br\s*\/?>|<\/div>/g, '\n').replace(/<[^>]+>/g, '')).split('\n').map(x => x.trim()).filter(x => x && !/^Section 15/i.test(x));
    const first = lines[0] || '';
    const product = first.split(/,?\s*©|\.\s*Copyright|\(c\)/i)[0].replace(/^[\s.]+|[\s.]+$/g, '') || 'd20pfsrd';
    // the user's table does not use alternate third-party systems: Spheres of Power/Might, psionics, pact magic, veilweaving
    if (/spheres of (power|might)|spherecasting|sphere talents?|casting tradition|drop dead studios|psi-like abilit|power points|manifester level|dreamscarred|pact magic|radiance house|veilweav/i.test(page)) { spheres++; continue; }
    const isPaizo = (/Paizo (Inc|Publishing)/i.test(first) || /^Pathfinder (Adventure Path|Roleplaying Game|RPG|Campaign Setting|Chronicles|Module|Player Companion|Society|#?\d)/i.test(product)) &&
      !/Paizo Fans United|Wayfinder/i.test(first);
    const starts = [...page.matchAll(/<p class="title">/g)].map(m => m.index);
    if (!starts.length) continue;
    const endAt = Math.min(...[page.indexOf('class="section15"'), page.indexOf('article-edit-link'), page.length].filter(x => x > 0));
    let blocks = '';
    starts.forEach((s, i) => {
      const seg = page.slice(s, Math.min(starts[i + 1] || endAt, endAt));
      if (!/<b>AC<\/b>|<b>hp<\/b>/.test(seg)) return;
      const conv = convertBlock(seg, (isPaizo ? 'PZO: ' : '3PP: ') + product);
      if (conv.startsWith('<h2 class="title">Unknown') || conv.startsWith('<h2 class="title"> CR') || conv.startsWith('<h2 class="title">CR')) return; // no CR or no name
      const name = (conv.match(/<h2 class="title">([\s\S]*?)<\/h2>/) || [])[1].replace(/\s*CR\s+\S+.*$/, '').trim();
      // Paizo creatures, or ones whose page names no source, are skipped when the wiki already has that name
      if ((isPaizo || !s15) && seen(name)) { skipped++; return; }
      blocks += conv;
      if (isPaizo) paizo++; else thirdParty++;
    });
    if (!blocks) continue;
    const h1 = ((page.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1] || '').replace(/<[^>]+>/g, '').trim();
    fs.writeFileSync(path.join(out, 'pages', f), '<h1 class="title">' + decode(h1) + '</h1>' + blocks + '</span>');
  }
  console.log('third-party', thirdParty, 'paizo missing', paizo, 'paizo already on wiki', skipped, 'alternate systems skipped', spheres);
}
module.exports = { convertBlock };
