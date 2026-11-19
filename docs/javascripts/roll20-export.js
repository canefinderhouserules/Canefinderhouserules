// Roll20 export for monster stat blocks. A page holds the creature as JSON in <script class="r20-data">; this script
// adds a "Copy for Bio & Info" button that puts the stat block on the clipboard as rich HTML. Pasted (Ctrl+V) into a
// Roll20 character's Bio & Info, it keeps its links, and each attack, save and check link rolls in chat when clicked
// (links of the form href="`<chat command>"). Works in free games: no API scripts.
// Every roll also adds the totals of the character's Pathfinder by Roll20 sheet, left blank (all 10s, no class), so
// those totals are 0 until a Buff or condition on the sheet changes them:
//   attacks  + melee_mod / ranged_mod + attack_bonus + attack_condition
//   damage   + damage_bonus + melee_damage_bonus / ranged_damage_bonus (multiplied on a crit)
//   saves, initiative, skills: + the sheet total for that stat (fortitude, stealth...) + its condition penalty
// The character must be set up with "Edit sheet directly" (Roll20 asks on a new character), or melee_mod and
// ranged_mod do not exist yet and Roll20 prints "No attribute was found".
// Rolls name the character (@{Name|attr}), so the name typed in the panel must match the Roll20 character.
// Tested in a free Roll20 game (Power Attack buff: -1 to attack, +2 to damage).
(function () {
  var me = document.currentScript && document.currentScript.src;
  var SPELLS = me ? new URL('../magic/spells/', me).href : ''; // absolute, so the links work from Roll20
  function sgn(n) { return (n < 0 ? '-' : '+') + Math.abs(n); }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  // chat text inside an href: a double quote would end the attribute, so it becomes a single quote
  function cmd(s) { return s.replace(/"/g, "'"); }
  function sheetAttr(stat) {
    var map = { CMB: 'cmb_mod', Fort: 'fortitude', Ref: 'reflex', Will: 'will', Init: 'initiative' };
    // sheet names: "Knowledge (arcana)" -> knowledge_arcana, "Sense Motive" -> sense_motive
    return map[stat] || stat.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  }
  // the sheet keeps condition penalties (shaken, sickened...) apart from the totals and adds them when it rolls
  function conditionAttr(stat) {
    return { CMB: 'attack_condition', Fort: 'saves_condition', Ref: 'saves_condition', Will: 'saves_condition', Init: 'initiative_condition' }[stat] || 'skill_condition';
  }

  var SKILLS = ['acrobatics', 'appraise', 'bluff', 'climb', 'diplomacy', 'disable_device', 'disguise', 'escape_artist', 'fly',
    'handle_animal', 'heal', 'intimidate', 'knowledge_arcana', 'knowledge_dungeoneering', 'knowledge_engineering', 'knowledge_geography',
    'knowledge_history', 'knowledge_local', 'knowledge_nature', 'knowledge_nobility', 'knowledge_planes', 'knowledge_religion', 'linguistics',
    'perception', 'ride', 'sense_motive', 'sleight_of_hand', 'spellcraft', 'stealth', 'survival', 'swim', 'use_magic_device'];
  // wrap dice in text as inline rolls ("sleep for 2d4 minutes" -> "sleep for [[2d4]] minutes")
  function rollDice(t) { return t.replace(/\b(\d+d\d+(?:\s*[+-]\s*\d+(?!d))?)\b/g, function (d) { return '[[' + d.replace(/\s/g, '') + ']]'; }); }
  // old hand-written pages list attacks in one array; new ones list alternatives (melee/ranged groups of full attacks)
  function attackGroups(m) {
    if (m.melee || m.ranged) return { melee: m.melee || [], ranged: m.ranged || [] };
    var melee = [], ranged = [];
    (m.attacks || []).forEach(function (a) {
      var b = { name: a.name, count: 1, bonuses: [a.bonus], dice: a.dice, mod: a.mod, threat: a.threat, mult: a.mult, rider: a.rider || '', kind: a.kind };
      if (/ranged/i.test(a.kind)) ranged.push([b]); else melee.push(b);
    });
    return { melee: melee.length ? [melee] : [], ranged: ranged };
  }

  function bioHtml(m, who) {
    var A = function (attr) { return '@{' + who + '|' + attr + '}'; };
    var link = function (label, text) { return '<a href="`' + esc(cmd(text)) + '">' + esc(label) + '</a>'; };
    var row = function (k, v) { return '<tr><td><b>' + esc(k) + '</b></td><td>' + v + '</td></tr>'; };
    // extra: text inside the roll, e.g. &{tracker} (adds the selected token to the turn order)
    var roll = function (label, base, stat, extra) {
      var attr = sheetAttr(stat), known = stat in { CMB: 1, Fort: 1, Ref: 1, Will: 1, Init: 1 } || SKILLS.indexOf(attr) >= 0;
      return link(label + ' ' + sgn(base), '/em ' + label + ': [[1d20' + sgn(base) + (known ? '+' + A(attr) : '') + '+' + A(conditionAttr(stat)) + (extra || '') + ']]');
    };
    var atkMod = function (ranged) { return '+' + A(ranged ? 'ranged_mod' : 'melee_mod') + '+' + A('attack_bonus') + '+' + A('attack_condition'); };

    // one weapon attack at one bonus: attack, damage, rider, crit confirmation and crit damage
    var attackText = function (a, bonus, label) {
      var ranged = /ranged/i.test(a.kind);
      var atk = sgn(bonus) + atkMod(ranged);
      var cs = a.threat < 20 ? 'cs>' + a.threat : '';
      var rider = a.rider ? ' ' + rollDice(a.rider) : '';
      // no attack roll (swarms): damage only
      if (a.auto) return label + ': damage [[' + (a.dice ? a.dice + sgn(a.mod || 0) : '0') + ']]' + rider + ' (no attack roll)';
      if (!a.dice) return label + ': attack [[1d20' + cs + atk + ']]' + rider;
      var dmgBonus = '(' + (a.mod || 0) + '+' + A('damage_bonus') + '+' + A(ranged ? 'ranged_damage_bonus' : 'melee_damage_bonus') + ')';
      var critDice = a.dice.replace(/^(\d+)d/, function (_, n) { return (n * a.mult) + 'd'; });
      var crit = a.threat < 20 ? a.threat + '-20/x' + a.mult : 'x' + a.mult;
      return label + ': attack [[1d20' + cs + atk + ']] damage [[' + a.dice + '+' + dmgBonus + ']]' + rider +
        ' - crit ' + crit + ': confirm [[1d20' + atk + ']] crit damage [[' + critDice + '+' + a.mult + '*' + dmgBonus + ']]';
    };
    var describe = function (a) {
      return (a.count > 1 ? a.count + ' ' : '') + a.name + ' ' + a.bonuses.map(sgn).join('/') + (a.touch ? ' touch' : '') + ' (' +
        (a.dice ? a.dice + (a.mod ? sgn(a.mod) : '') + (a.threat < 20 ? '/' + a.threat + '–20' : '') + (a.mult > 2 ? '/×' + a.mult : '') : '') +
        (a.rider ? (a.dice ? ' ' : '') + a.rider : '') + ')';
    };
    // every attack in a full attack: each iterative bonus and each of "2 claws"
    var fullText = function (group) {
      var parts = [];
      group.forEach(function (a) {
        for (var c = 1; c <= (a.count || 1); c++) (a.auto ? [0] : a.bonuses).forEach(function (b, i) {
          parts.push(attackText(a, b, a.name + ((a.count || 1) > 1 ? ' ' + c : '') + (a.bonuses.length > 1 ? ' #' + (i + 1) : '')));
        });
      });
      return parts.join(' / ');
    };
    var g = attackGroups(m), attackLines = [];
    ['melee', 'ranged'].forEach(function (kind) {
      g[kind].forEach(function (group, gi) {
        var singles = group.map(function (a) { return link(a.name, '/em ' + attackText(a, a.bonuses[0], a.name)); });
        var many = group.length > 1 || group.some(function (a) { return (a.count || 1) > 1 || a.bonuses.length > 1; });
        attackLines.push((gi ? 'or ' : '') + '<i>' + kind + '</i> ' + singles.join(', ') +
          (many ? ' · ' + link('Full attack', '/em Full attack - ' + fullText(group)) : '') +
          ' <small>' + esc(group.map(describe).join(', ')) + '</small>');
      });
    });
    var saves = Object.keys(m.saves).map(function (k) { return roll(k, m.saves[k], k); });
    var checks = Object.keys(m.checks || {}).map(function (k) { return roll(k, m.checks[k], k); });

    // spells: each name posts its DC, save, note and rolls; touch spells roll a ranged touch attack per ray; the arrow opens its page
    var spellButton = function (s, touch) {
      var parts = [];
      if (s.dc) parts.push('DC ' + s.dc + (s.save ? ' ' + s.save : ''));
      else if (s.save) parts.push(s.save);
      for (var i = 1; i <= (s.touch ? (s.rays || 1) : 0); i++)
        parts.push((s.rays > 1 ? 'ray ' + i + ' ' : '') + 'ranged touch [[1d20' + sgn(touch) + atkMod(true) + ']]' + (s.damage ? ' damage [[' + s.damage + ']]' : ''));
      if (s.damage && !s.touch) parts.push((s.damageLabel || 'damage') + ' [[' + s.damage + ']]');
      if (s.note) parts.push(s.note);
      if (s.effect) parts.push(s.effect);
      var name = s.name.charAt(0).toUpperCase() + s.name.slice(1);
      var slug = s.page || (s.page === undefined && m.attacks ? s.name.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : '');
      return link(s.name, '/em casts ' + name + (parts.length ? ': ' + parts.join(', ') : '')) +
        (slug && SPELLS ? ' <a href="' + esc(SPELLS + slug + '/') + '">↗</a>' : '');
    };
    var spellRows = (m.spells || []).map(function (b) {
      var head = [b.cl ? esc('CL ' + b.cl) : '', b.concentration != null ? link('Concentration ' + sgn(b.concentration), '/em Concentration: [[1d20' + sgn(b.concentration) + ']]') : '',
        b.note ? esc(b.note) : ''].filter(Boolean).join(' &nbsp; ');
      return row(b.title, head + b.levels.map(function (l, i) {
        return (head || i ? '<br>' : '') + '<b>' + esc(l.label) + ':</b> ' + l.spells.map(function (s) { return spellButton(s, m.rangedTouch); }).join(', ');
      }).join(''));
    });
    var showRow = function (label, name, text) { return row(label, link('Show', '/em ' + name + ': ' + rollDice(text)) + ' ' + esc(text)); };
    var specialRows = (m.special || []).map(function (s) {
      var rolls = (s.rolls || []).map(function (r) { return r[0] + ' [[' + r[1] + ']]'; });
      if (rolls.length) return row(s.name + (s.type ? ' (' + s.type + ')' : ''), link('Show', '/em ' + s.name + ': ' + s.text + ' - ' + rolls.join(', ')) + ' ' + esc(s.text));
      return showRow(s.name + (s.type ? ' (' + s.type + ')' : ''), s.name, s.text);
    });

    return '<h3>' + esc(m.name + (m.cr ? ' (CR ' + m.cr + ')' : '')) + '</h3>' +
      (m.line ? '<p><i>' + esc(m.line) + '</i></p>' : '') +
      '<table>' +
      (m.aura ? row('Aura', esc(m.aura)) : '') +
      row('AC', esc(m.ac)) + row('hp', esc(m.hp)) + row('Speed', esc(m.speed)) +
      (m.defense ? row('Defense', esc(m.defense)) : '') +
      (attackLines.length ? row('Attacks', attackLines.join('<br>')) : '') +
      (m.specialAttacks ? showRow('Special Attacks', 'Special attacks', m.specialAttacks) : '') +
      row('Rolls', [roll('Init', m.init, 'Init', ' &{tracker}')].concat(saves).join(' &nbsp; ') + (m.saveNote ? ' <small>' + esc(m.saveNote) + '</small>' : '')) +
      (checks.length ? row('Checks', checks.join(' &nbsp; ')) : '') +
      spellRows.join('') + specialRows.join('') +
      (m.abilities ? row('Stats', esc(m.abilities + (m.combat ? '; ' + m.combat : ''))) : '') +
      (m.feats ? row('Feats', esc(m.feats)) : '') +
      (m.senses ? row('Senses', esc(m.senses)) : '') +
      (m.languages ? row('Languages', esc(m.languages)) : '') +
      (m.sq ? row('SQ', esc(m.sq)) : '') +
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
    // data-r20 attribute (generated pages) or a <script class="r20-data"> inside the box (hand-written pages)
    var script = box.querySelector('script.r20-data');
    var raw = box.getAttribute('data-r20') || (script && script.textContent); if (!raw) return;
    var m; try { m = JSON.parse(raw); } catch (e) { return; }
    var wrap = el('details', 'r20'); wrap.appendChild(el('summary', null, 'Roll20'));
    var ol = el('ol', 'r20-steps');
    [ 'In the Roll20 Journal, create a character and, when Roll20 asks how to create it, choose Edit Sheet Directly (Pathfinder by Roll20 sheet, left blank). Type its name below.',
      'Click Copy for Bio & Info.',
      'In Roll20, open the character, click Edit, click inside the Bio & Info box and press Ctrl+V. Save Changes.',
      'Open the Bio & Info tab: each attack, save and check rolls in chat when clicked. Buffs and conditions set on the character sheet are added to the rolls. Init also adds the selected token to the turn order.'
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
