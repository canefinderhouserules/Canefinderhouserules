# Dark Naga

Dark nagas are twelve-foot serpents with black, eel-like scales and a human face. They covet wealth and power, scheme from underground lairs, and despise other dark nagas.

<div class="r20-export" markdown="0">
<script type="application/json" class="r20-data">
{
  "name": "Dark Naga",
  "cr": "8",
  "xp": 4800,
  "line": "LE Large aberration",
  "init": 5,
  "senses": "darkvision 60 ft., detect thoughts",
  "ac": "22, touch 15, flat-footed 16",
  "hp": "85 (10d8+40)",
  "saves": { "Fort": 7, "Ref": 10, "Will": 9 },
  "defense": "+2 on saves vs. charm effects; guarded thoughts; immune poison",
  "speed": "40 ft.; space 10 ft., reach 5 ft.",
  "attacks": [
    { "name": "Bite", "kind": "Melee", "bonus": 8, "dice": "1d4", "mod": 2, "threat": 20, "mult": 2 },
    { "name": "Sting", "kind": "Melee", "bonus": 8, "dice": "2d4", "mod": 2, "threat": 20, "mult": 2, "rider": "plus poison" }
  ],
  "rangedTouch": 11,
  "spells": [
    {
      "title": "Spells Known", "cl": 7, "concentration": 10, "note": "(+14 casting defensively)",
      "levels": [
        { "label": "3rd (5/day)", "spells": [
          { "name": "displacement" },
          { "name": "lightning bolt", "dc": 16, "save": "Ref half", "damage": "7d6", "damageLabel": "electricity damage" }
        ] },
        { "label": "2nd (7/day)", "spells": [
          { "name": "cat's grace" },
          { "name": "invisibility" },
          { "name": "scorching ray", "touch": true, "rays": 2, "damage": "4d6" }
        ] },
        { "label": "1st (7/day)", "spells": [
          { "name": "expeditious retreat" },
          { "name": "magic missile", "damage": "4d4+8", "damageLabel": "force damage, 4 missiles" },
          { "name": "ray of enfeeblement", "dc": 14, "save": "Fort half", "touch": true, "damage": "1d6+3", "effect": "damage is the Strength penalty" },
          { "name": "shield" },
          { "name": "silent image", "dc": 14, "save": "Will disbelief" }
        ] },
        { "label": "0 (at will)", "spells": [
          { "name": "daze", "dc": 13, "save": "Will negates" },
          { "name": "detect magic" },
          { "name": "light" },
          { "name": "mage hand" },
          { "name": "open/close" },
          { "name": "ray of frost", "touch": true, "damage": "1d3" },
          { "name": "read magic" }
        ] }
      ]
    }
  ],
  "special": [
    { "name": "Poison", "type": "Ex", "text": "Sting, injury; save Fort DC 19; frequency 1 round; effect sleep for 2d4 minutes; cure 1 save.", "rolls": [["minutes asleep", "2d4"]] },
    { "name": "Detect Thoughts", "type": "Su", "text": "Continuous detect thoughts as the spell, caster level 9th; Will DC 18 negates." },
    { "name": "Guarded Thoughts", "type": "Ex", "text": "Immune to any form of mind reading, such as detect thoughts; +2 racial bonus on saves against charm effects." }
  ],
  "abilities": "Str 14, Dex 21, Con 18, Int 16, Wis 15, Cha 17",
  "combat": "BAB +7; CMB +10; CMD 26 (can't be tripped)",
  "checks": { "Perception": 19, "Stealth": 18, "Bluff": 13, "Escape Artist": 13, "Knowledge (arcana)": 13, "Intimidate": 12, "Spellcraft": 12, "Sense Motive": 10, "Diplomacy": 9, "Disguise": 9, "CMB": 10 },
  "feats": "Alertness, Combat Casting, Dodge, Eschew Materials, Lightning Reflexes, Stealthy",
  "languages": "Common, Infernal"
}
</script>
</div>

## Dark Naga (CR 8)

**XP** 4,800  
LE Large aberration  
**Init** +5; **Senses** darkvision 60 ft., [detect thoughts](#detect-thoughts-su); Perception +19

**Defense**

**AC** 22, touch 15, flat-footed 16 (+5 Dex, +1 dodge, +7 natural, −1 size)  
**hp** 85 (10d8+40)  
**Fort** +7, **Ref** +10, **Will** +9; +2 vs. charm effects  
**Defensive Abilities** guarded thoughts; **Immune** poison

**Offense**

**Speed** 40 ft.  
**Melee** bite +8 (1d4+2), sting +8 (2d4+2 plus poison)  
**Space** 10 ft.; **Reach** 5 ft.  
**Spells Known** (CL 7th; concentration +10)  
3rd (5/day)—[displacement](../magic/spells/displacement.md), [lightning bolt](../magic/spells/lightning-bolt.md) (DC 16)  
2nd (7/day)—[cat's grace](../magic/spells/cats-grace.md), [invisibility](../magic/spells/invisibility.md), [scorching ray](../magic/spells/scorching-ray.md)  
1st (7/day)—[expeditious retreat](../magic/spells/expeditious-retreat.md), [magic missile](../magic/spells/magic-missile.md), [ray of enfeeblement](../magic/spells/ray-of-enfeeblement.md) (DC 14), [shield](../magic/spells/shield.md), [silent image](../magic/spells/silent-image.md) (DC 14)  
0 (at will)—[daze](../magic/spells/daze.md) (DC 13), [detect magic](../magic/spells/detect-magic.md), [light](../magic/spells/light.md), [mage hand](../magic/spells/mage-hand.md), [open/close](../magic/spells/open-close.md), [ray of frost](../magic/spells/ray-of-frost.md), [read magic](../magic/spells/read-magic.md)

**Statistics**

**Str** 14, **Dex** 21, **Con** 18, **Int** 16, **Wis** 15, **Cha** 17  
**Base Atk** +7; **CMB** +10; **CMD** 26 (can't be tripped)  
**Feats** Alertness, Combat Casting, Dodge, Eschew Materials (bonus feat), Lightning Reflexes, Stealthy  
**Skills** Bluff +13, Diplomacy +9, Disguise +9, Escape Artist +13, Intimidate +12, Knowledge (arcana) +13, Perception +19, Sense Motive +10, Spellcraft +12, Stealth +18  
**Languages** Common, Infernal

**Ecology**

**Environment** any underground  
**Organization** solitary or nest (2–4)  
**Treasure** standard

**Special Abilities**

#### Detect Thoughts (Su)

A dark naga can continuously use [detect thoughts](../magic/spells/detect-thoughts.md) as the spell (caster level 9th; Will DC 18 negates). The save DC is Charisma-based.

#### Guarded Thoughts (Ex)

Dark nagas are immune to any form of mind reading, such as detect thoughts. This ability also grants a +2 racial bonus on all saves against charm effects.

#### Poison (Ex)

Sting—injury; *save* Fort DC 19; *frequency* 1 round; *effect* sleep for 2d4 minutes; *cure* 1 save. The save DC is Constitution-based.

#### Spells

Dark nagas cast spells as 7th-level sorcerers.
