// Roll20 export for monster stat blocks. A page holds the creature as JSON in <script class="r20-data">; this script
// adds a "Copy for Bio & Info" button that puts the stat block on the clipboard as rich HTML. Pasted (Ctrl+V) into a
// Roll20 character's Bio & Info, it keeps its links, and each attack, save and check link rolls in chat when clicked
// (links of the form href="`<chat command>"). Works in free games: no API scripts.
// Every roll also adds the totals of the character's Pathfinder by Roll20 sheet, left blank (all 10s, no class), so
// those totals are 0 until a Buff or condition on the sheet changes them:
//   attacks  + melee_mod / ranged_mod + attack_bonus
//   damage   + damage_bonus + melee_damage_bonus / ranged_damage_bonus (multiplied on a crit)
//   saves, initiative, skills: + the sheet's total for that stat (fortitude, initiative, stealth...)
// Rolls name the character (@{Name|attr}), so the name typed in the panel must match the Roll20 character.
// Tested in a free Roll20 game (Power Attack buff: -1 to attack, +2 to damage).
(function () {
  function sgn(n) { return (n < 0 ? '-' : '+') + Math.abs(n); }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  // chat text inside an href: a double quote would end the attribute, so it becomes a single quote
  function cmd(s) { return s.replace(/"/g, "'"); }
  function sheetAttr(stat) {
    var map = { CMB: 'cmb_mod', Fort: 'fortitude', Ref: 'reflex', Will: 'will', Init: 'initiative' };
    return map[stat] || stat.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  }

  function bioHtml(m, who) {
    var A = function (attr) { return '@{' + who + '|' + attr + '}'; };
    var link = function (label, text) { return '<a href="`' + esc(cmd(text)) + '">' + esc(label) + '</a>'; };
    var row = function (k, v) { return '<tr><td><b>' + esc(k) + '</b></td><td>' + v + '</td></tr>'; };
    var roll = function (label, base, attr) { return link(label + ' ' + sgn(base), '/em ' + label + ': [[1d20' + sgn(base) + '+' + A(attr) + ']]'); };

    var attacks = m.attacks.map(function (a) {
      var ranged = /ranged/i.test(a.kind);
      var atk = sgn(a.bonus) + '+' + A(ranged ? 'ranged_mod' : 'melee_mod') + '+' + A('attack_bonus');
      var dmgBonus = '(' + a.mod + '+' + A('damage_bonus') + '+' + A(ranged ? 'ranged_damage_bonus' : 'melee_damage_bonus') + ')';
      var critDice = a.dice.replace(/^(\d+)d/, function (_, n) { return (n * a.mult) + 'd'; });
      var crit = a.threat < 20 ? a.threat + '-20/x' + a.mult : 'x' + a.mult;
      var cs = a.threat < 20 ? 'cs>' + a.threat : '';
      return link(a.name, '/em ' + a.name + ': attack [[1d20' + cs + atk + ']] damage [[' + a.dice + '+' + dmgBonus + ']]' +
        ' - crit ' + crit + ': confirm [[1d20' + atk + ']] crit damage [[' + critDice + '+' + a.mult + '*' + dmgBonus + ']]') +
        ' ' + esc('(' + a.kind.toLowerCase() + ' ' + sgn(a.bonus) + ', ' + a.dice + (a.mod ? sgn(a.mod) : '') + '/' + (a.threat < 20 ? a.threat + '–20' : '×' + a.mult) + ')');
    });
    var saves = Object.keys(m.saves).map(function (k) { return roll(k, m.saves[k], sheetAttr(k)); });
    var checks = Object.keys(m.checks || {}).map(function (k) { return roll(k, m.checks[k], sheetAttr(k)); });

    return '<h3>' + esc(m.name + ' (CR ' + m.cr + ')') + '</h3>' +
      '<p><i>' + esc(m.line) + '</i></p>' +
      '<table>' +
      row('AC', esc(m.ac)) + row('hp', esc(m.hp)) + row('Speed', esc(m.speed)) +
      row('Attacks', attacks.join('<br>')) +
      row('Rolls', [roll('Init', m.init, 'initiative')].concat(saves).join(' &nbsp; ')) +
      (checks.length ? row('Checks', checks.join(' &nbsp; ')) : '') +
      row('Stats', esc(m.abilities + '; ' + m.combat)) +
      (m.feats ? row('Feats', esc(m.feats)) : '') +
      (m.senses ? row('Senses', esc(m.senses)) : '') +
      (m.languages ? row('Languages', esc(m.languages)) : '') +
      (m.gear ? row('Gear', esc(m.gear)) : '') +
      '</table>';
  }

  function copyHtml(html, plain, btn) {
    var handler = function (e) { e.clipboardData.setData('text/html', html); e.clipboardData.setData('text/plain', plain); e.preventDefault(); };
    document.addEventListener('copy', handler);
    var ok = false; try { ok = document.execCommand('copy'); } catch (e) {}
    document.removeEventListener('copy', handler);
    var t = btn.textContent; btn.textContent = ok ? 'Copied!' : 'Copy failed'; setTimeout(function () { btn.textContent = t; }, 1500);
  }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; }

  function build(box) {
    var data = box.querySelector('script.r20-data'); if (!data) return;
    var m; try { m = JSON.parse(data.textContent); } catch (e) { return; }
    var wrap = el('details', 'r20'); wrap.appendChild(el('summary', null, 'Roll20'));
    var ol = el('ol', 'r20-steps');
    [ 'In the Roll20 Journal, create a character (Pathfinder by Roll20 sheet, left blank). Type its name below.',
      'Click Copy for Bio & Info.',
      'In Roll20, open the character, click Edit, click inside the Bio & Info box and press Ctrl+V. Save Changes.',
      'Open the Bio & Info tab: each attack, save and check rolls in chat when clicked. Buffs and conditions set on the character sheet are added to the rolls.'
    ].forEach(function (s) { ol.appendChild(el('li', null, s)); });
    wrap.appendChild(ol);
    var row = el('div', 'r20-row');
    var label = el('label', 'r20-hint', 'Character name: ');
    var input = el('input', 'r20-name'); input.type = 'text'; input.value = m.name; label.appendChild(input);
    var b = el('button', 'md-button r20-btn', 'Copy for Bio & Info'); b.type = 'button';
    b.addEventListener('click', function () {
      var who = (input.value || m.name).trim();
      copyHtml(bioHtml(m, who), m.name + ' (CR ' + m.cr + ')', b);
    });
    row.appendChild(b); row.appendChild(label);
    wrap.appendChild(row);
    wrap.appendChild(el('p', 'r20-sub', 'The name must match the Roll20 character exactly; rolls read its sheet by that name. Buffs apply to the character, so every token of it shares them.'));
    box.appendChild(wrap);
  }
  function start() { document.querySelectorAll('.r20-export').forEach(build); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
