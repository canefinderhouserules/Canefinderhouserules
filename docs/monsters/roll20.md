# Monsters in Roll20

Every creature page has a **Roll20** panel above each stat block. It copies the stat block into a Roll20 character, where every attack, save, check, spell and special ability is a button that rolls in chat. It works in free Roll20 games: no API scripts or paid account.

To make your own enemy and copy it the same way, use the [Enemy Builder](../tools/enemy-builder.md).

## Setting up a creature

1. In the Roll20 **Journal**, click **+ Add → Character** and give it any name. When Roll20 asks how to create it, choose **Edit Sheet Directly**. The game must use the **Pathfinder by Roll20** sheet; leave the sheet blank (abilities at 10, no class).
2. On the creature's page here, open the **Roll20** panel and click **Copy for Bio & Info**.
3. In Roll20, open the character, click **Edit**, click inside the **Bio & Info** box and press **Ctrl+V**. Click **Save Changes**.
4. Link a token to the character: double-click the token and pick the character under **Represents Character**.

Open the character's **Bio & Info** tab and keep the window beside the map: the stat block stays in view, and only the results of what you click go to chat.

**Select the creature's token before clicking a button.** The buttons read the sheet of the selected token, so the character's name does not matter and a renamed or duplicated character keeps working. With no token selected, Roll20 shows a warning and rolls the base numbers, without buffs or conditions. To tie the buttons to one character instead, so they work without selecting a token, type its exact Roll20 name in the panel's **Character name** box before copying (leave out parentheses, which break Roll20 references).
## What the buttons do

- **Attacks**: each attack rolls the attack, damage and any rider, a critical confirmation and critical damage. Creatures with several attacks also get **Full attack**, which rolls every attack, including each of "2 claws" and each iterative attack.
- **Init** rolls initiative and adds the selected token to the turn order.
- **Saves and checks** roll the listed bonus.
- **Spells and spell-like abilities** post the spell's DC and save, and what it does at the creature's caster level: damage and healing dice (fireball, poison's Constitution damage, cure serious wounds), bonuses that grow with level (shield of faith, barkskin, divine favor), checks (dispel magic) and the duration. Rays roll a ranged touch attack for each ray and touch spells (inflict wounds, poison, shocking grasp) a melee touch attack. The arrow (↗) opens the spell's page on this site.
- **Special attacks**: each one is its own button, so using one (channel energy, a breath weapon) shows the players only that one, with its dice rolled.
- **Special abilities**: **Show** posts the ability's text, with any dice in it rolled.

## Buffs and conditions

The rolls add the totals of the character's blank sheet. Those totals are 0 until a buff or condition changes them, so whatever you set on the sheet is added to the buttons:

- Open the character sheet, click **Buffs**, click **+**, give it a name and write its modifiers, then tick it. Examples: Power Attack as `-1 to melee; +2 to melee damage`; Haste as `+1 to attack; +1 dodge to AC`; Bless as `+1 morale to attack`; `+2 to saves`; `+4 to stealth`. Separate modifiers with `;`.
- Tick a **Condition** (shaken, sickened and so on) and its penalties apply to the attack, save, check and initiative buttons.

Buffs belong to the character, not the token: every token of the same character shares them. To buff one creature of a group, duplicate the character in the Journal and link that creature's token to the copy: the copied Bio & Info keeps working, since the buttons read the selected token.
