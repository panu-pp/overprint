# Overprint — Patch Notes

Playable build: https://claude.ai/artifact/YJoUEpRvgQW6VHbFDWUaks
Newest version first. All entries come from the build sessions. Every version was published on the date shown.

---

## v1.6 — Icon cards + readable chains (2026-11-17, local, not published yet)
**Perk cards (option B, "rule in icons"):** the card face has no text. It shows trigger icon → effect icon ×N, level pips and cost dots. Tap a card for the full WHEN → text. Level-up picks show the big icon rule, the name and the description.
- New `icons.js`: trigger and curse icons are SVG placeholders. Perk art comes from `icons/<id>.png` (risograph sheet made with Finifugu Bot / GPT Image, source in `art/gen/`). Reprint and Thrift still use placeholders.

**Chain steps (option B, "full beats + speed-up"):** each step plays anticipation → action → settle.
- Anticipation: the card lifts, an aim arc runs to the targets, and the targets pulse. The highlight stays on through the action.
- Action, by verb:
  - **Move** (Nudge, Slide, Tilt): tween with an ink-smear tail.
  - **Drop** (Aftershock): fall with streaks and squash.
  - **Destroy** (Shatter, Bomb, Domino, Pebble, line clear): crack, then splatter.
  - **Re-ink** (Overink): colour bleed.
  - **Rotate** (Turn, Reprint): spin.
  - New sounds: whoosh, thud, crack, splash, click.
- Pace: step 1 takes about 1.0s. Each later step is ×0.85 faster, with a floor of 0.45s. Tap the board during a chain to fast-forward ×3.
- Reduced-motion: no tweens, short pauses.

**Fixes:** the POT ×N banner now really hides after a chain (CSS `display:flex` was overriding `hidden`, so it stayed faded over the tray). Added doctype, charset and viewport so the GitHub Pages build renders in standards mode with a phone-width layout. Added an `?debug` test hook (`window.OP`).

---

## v1.5 — Board-mess curses (2026-11-10)
New rule: every curse messes with the board, adds **+50% score**, and has a **mirror reward** on the system it hurts. Curse bonuses now **add** (3 curses = ×2.5) instead of multiplying. Under the old maths, 4 curses gave ×6.4 for almost no risk.

| Curse | Board mess | Mirror reward |
|---|---|---|
| Narrow Press | Right column sealed | — |
| Heavy Type | Bigger pieces | Line points ×1.25 |
| **Ink Blot** (new) | A sealed 2×2 blot lands inside the board for the run | A clear through the blot scores ×3 points |
| **Spill** (replaces Rubble) | After each tray, 0–2 grey blocks land on empty cells | Each grey block you clear or a perk destroys: chain +1 |
| **Crease** (new) | Half of an inner column (4 cells) sealed for the run | Every line clear in a chain: chain +1 |
| **Wet Patch** (new) | Each tray, a random 2×2 is wet (blue, can't place there) | A clear touching it: points ×2 and chain +3 |
| **Smudge** (new) | After each tray, 2 random blocks swap ink | Tinted lines need only 4 of one ink |

- **Removed:** Overclock, Short Fuse, Short Feed, Ink-blind.
- **Town:** the Rubble tile now unlocks Spill, and the Short Feed tile unlocks Ink Blot. Crease, Wet Patch and Smudge are in the base pool.
- **Level-up curse cards** read "CURSE +50% SCORE". The HUD chip shows the total bonus.
- **Sim check** (60 runs each): every curse alone pays ×1.24–1.51 for an early build and ×1.43–2.21 for a late build.
- **Stacking is high risk, high return:** late build + 5 curses = ×8.3 with 62% deaths; all 7 = ×6.4 with 93% deaths.
- A row made only of sealed cells no longer counts as a full line (needed for sealed cells inside the board).

## v1.4 — Balance pass from the simulator (2026-11-10)
Based on `tools/sim.js` (60 bot runs per setup, max 300 placements). Results: `tools/sim-results-v1.3.2.json` (before) vs re-runs after.
- **Reprint / Turn cost ink.** Before, Reprint guaranteed survival (the bot never died in 60 runs). Each rescue now costs charges of any ink: 1, then 2, then 3… per run, and arming covers 1. With too little ink you get a "NEED n INK" pop and the run can end. Solo Reprint death rate: 0% → 38%.
- **Spark** adds chain mult only **once per chain** (it used to add +1 on every destroy, about +3 per chain). Pot per block is now +10/+20/+30. Gain in a 3-perk build: +188% → +65%.
- **Boosted (⚡) fires add +2 chain mult** instead of +1, so arming and charges now matter for score.
- **New "tinted line"**: a cleared line where 5+ blocks share one ink (pure lines count too).
  - **Ink Bomb** and **Prism** now trigger on tinted lines. They fired on about 5% of chains, now about 60%.
  - **Tilt** triggers on tinted lines (was 2+ lines at once, about 6%; now about 60%).
- **Difficulty ramps with level.** From Lv1 to Lv15 the tray deals more 5+ block pieces (up to ×2.6 weight), and the small-piece mercy on a crowded board shrinks. No-perk runs: 104 → 84 placements.
- Known: Tilt and Nudge are still the strongest survival perks. Curses are unchanged (redesign pending).

## v1.3.2 — End run button (2026-11-10)
- New **END RUN** button in the perk bar, next to SOUND. Tap once and it turns red ("TAP TO END"). Tap again within 3s to end the run.
- Ending early works like a normal game over: score is banked, Ink is paid, the best score updates and the score posts to the leaderboard.
- Disabled during a chain and on the level-up screen.

## v1.3.1 — Wet Ink stacks (2026-11-10)
- **Wet Ink now builds chain after chain.** Each chain adds keep% of the multiplier *its perks added* on top of the wet ink already there. Before, the carry was re-calculated each chain, so it levelled off and shrank after weak chains.
- It no longer decays. It dries only when the streak breaks (a whole tray with no clear).
- Cap raised to **+5 / +10 / +15** by level (was +3/+6/+9).
- Example, Lv1, each chain gains +2 from perks: wet ink goes +0.6 → +1.2 → +1.8 → +2.4 … up to +5. A chain where no perk fires keeps the stack as it is.
- Card text: "Chain ends → stack 30%". The Retarder tile says it stacks +10% more per level.

## v1.3 — Tray Streak + Wet Ink (2026-11-10)
Inspired by the Block Blast research (its combo survives if you clear at least once every 3 pieces), adapted to our chains.

**Tray streak**
- The streak now survives as long as you clear **at least once per tray**. It breaks only when a whole tray passes with no clear.
- Every clearing placement adds +1 streak.
- The streak multiplies the **whole chain payout**: ×(1 + 0.1 × (streak − 1)). Streak 11 = ×2, streak 31 = ×4.
- The old per-line streak bonus was removed (it no longer stacks twice).
- New HUD stamp, "STREAK 7 ×1.6". It pops on each clear, then turns dark and shakes on the last tray piece when the tray has had no clear yet.
- The payout pop shows "CHAIN ×N STREAK ×N +total". A "STREAK LOST" pop appears when the streak breaks.

**New perk: Wet Ink** (passive, in the base pool, max Lv3)
- When a chain ends, part of its extra multiplier stays wet and is added to the next chain's starting multiplier.
- Lv1 keeps 30% (cap +3), Lv2 keeps 40% (cap +6), Lv3 keeps 50% (cap +9).
- Wet ink dries when the streak breaks.
- Pops: "WET +x → NEXT CHAIN" when a chain ends and "WET INK +x" when the next chain opens. A blue HUD tag shows the wet ink waiting in between.
- The cap stops Gold Dust from snowballing it forever.

**Town: Retarder tile**
- Tile 3,4 (was +10% EXP) is now **Retarder**, the first upgradeable tile: 3 levels at 60 / 120 / 180 ink.
- Each level adds +10% Wet Ink carry-over. Wet Ink Lv3 with Retarder 3/3 keeps 80%.
- The tile shows "WET n/3" and keeps pulsing while it can still be upgraded. "Refund all" returns every level.
- Old saves: an owned 3,4 tile becomes Retarder level 1.

**Other**
- Passive perks with levels can now appear as upgrade cards.
- The title how-to mentions the streak.

## v1.2 — Perk levels make one fire bigger (2026-11-10)
- Every perk fires **once per chain**, except Spark, which fires on every destroy. **Level makes that single fire stronger.** (Old rule: "fires up to N× per chain". Clear-trigger perks almost never got a 2nd trigger.)
- Per-level scaling:
  - Shatter, Domino and Pebble break 1/2/3 blocks.
  - Nudge moves 1/2/3 blocks. Aftershock drops and Slide shifts 1/2/3 steps.
  - Tilt tilts 1/2/3 times. Turn rotates up to 1/2/3 pieces.
  - Ink Bomb makes 1/2/3 blasts. Overink re-inks a + shape, then 3×3, then a big ◇.
  - Gold Dust gives ×2/×3/×4. Prism, Echo and Siphon give +1/+2/+3.
- Armable perks are always boosted at max level. Reprint max level is 2.
- Card text shows the current number. Upgrade cards show "X (was Y)". Tapping a levelled card shows "Now: …". The tag is back to AUTO.

## v1.1.6 (2026-11-10)
- The "AUTO" tag on levelled perks read "3×/CHAIN", and the info line shows the level. (Replaced in v1.2.)

## v1.1.5 (2026-11-10)
- Fix: the line-clear preview no longer repaints cleared blocks in the dragged piece's colour.

## v1.1.4 (2026-11-10)
- Fix: floating chain totals shrink and clamp to stay on screen.
- Spark's card text scales with level. Level-up cards say "any colour".

## v1.1.3 — Perk audit (2026-11-10)
- New level helpers (max level, upgrade text). Reprint max level is 2.
- Boosts are no longer wasted when Reprint, Tilt or Turn would do nothing.
- Fixed the Thrift discount leaking into the rack cost display.
- Perk steps that do nothing add no token, sound or mult.

## v1.1.2 (2026-11-10)
- The "any colour" cost pip is now a red/yellow/blue pie.
- Armable perks at max level show ⚡ALWAYS and can't be armed.

## v1.1.1 (2026-11-10)
- Fix: perk cards faded before their step played. Now the card lights up yellow while its step fires.

## v1.1 — Chain multiplier + Clean Sheet (2026-11-10)
- The chain mult is linear: **+1 for each perk step that does something** (×1, ×2, ×3…).
- A ×N stamp flies from the card to the pot and punches it. Colour tiers: blue, then yellow from ×4, then red from ×8.
- **Clean Sheet**: empty the board during a chain for chain ×2, once per chain, with a full-screen splash.
- New sounds and haptics for mult and Clean Sheet. The payout pop reads "CHAIN ×N +total".

## v1.0 — Leaderboard (2026-11-09)
- **Online leaderboard** stored in the artifact's shared database. Org members who sign in can post scores. Outside visitors can view but not post. Signed-out visitors get the local board only.
- The game over screen has a **Name** field (16 characters max, remembered) and **ONLINE** / **THIS DEVICE** tabs. Your row is yellow, and if you're outside the top list it shows your rank ("You: #23 · 4,120").
- Your best score posts only if it beats your previous online best. Changing your name updates your entry. The owner can fix or delete any entry.
- **This device** keeps the top 10 runs locally.
- New **LEADERBOARD** button on the title screen.

## v0.9 — 6 slots, perk levels, new board perks (2026-11-09)
- **6 base slots** (3×2 rack). The two Town corner tiles add a 7th and 8th slot, and the rack switches to 4 columns when you have more than 6.
- **Picking an owned perk levels it up**, using no slot: Lv2 = fires up to 2× per chain, Lv3 = up to 3× and armable perks always boosted. Spark scales its points instead. (Reworked in v1.2.)
- New perks:
  - **Pebble:** line clears → break the loneliest block. In the starting pool.
  - **Aftershock:** row clears → blocks above drop 1. In the starting pool.
  - **Slide:** column clears → blocks to the right shift 1 left. Town tile.
- **Stamp removed.** It was the only perk that added blocks. Design rule: perks never add blocks, they only move, drop, destroy or re-ink.
- The artifact is now shared as "anyone with the link".

## v0.8 — Auto perks + arm to boost (2026-11-09)
- **Chains never stop for input.** Every perk fires by itself with a smart target, then the chain pays out and closes. Aiming, picking and the DONE button are gone.
- **Arming:** between moves, tap a perk to pay its cost (the card turns yellow, ⚡ARMED). Its next fire is boosted. Tap again to cancel and get the charges back.
- New triggers and boosts:
  - Shatter: chain opens; boost breaks 3.
  - Nudge: chain opens; boost moves 2.
  - Stamp: chain opens; boost places 3.
  - Overink: chain opens, re-inks a + shape; boost re-inks 3×3.
  - Tilt: 2+ lines clear; boost tilts twice.
  - Ink Bomb: pure line clears; boost blasts 5×5.
  - Turn: stuck; boost rotates every piece.
  - Reprint: stuck; boost deals small pieces.
- Thrift changed to: the first armable perk to fire each chain is boosted for free.
- **RESCUE chain:** when no piece fits, Turn and Reprint run before game over. This replaces "Last Ink".

## v0.7 — Board-movement perks + new curses (2026-11-09)
- New active perks in the starting pool:
  - **Nudge** (1 any): drag a block to an empty slot.
  - **Tilt** (1 blue): swipe to slide all blocks.
  - **Turn** (1 yellow): rotate a tray piece 90°.
- A line completed by Nudge or Tilt clears as the next chain step.
- New curses that don't touch the board:
  - **Ink-blind ×1.5:** tray pieces show grey until placed.
  - **Short Fuse ×1.5:** chains stop after 3 steps.

## v0.6.2 (2026-11-09)
- Fix from the "Top spacing" artifact comment: the perk bar got top padding and a divider, it no longer slides up during a chain, and a yellow tint shows a chain is active.

## v0.6.1 (2026-11-09)
- **SOUND** mute button in the perk bar (setting remembered).

## v0.6 — Sound, haptics, UI fit (2026-11-09)
- Print-shop sound effects. Each chain step plays the next note up the scale, so long chains climb like a melody.
- Other sounds: place (heavier for bigger pieces), clear (with a bell on pure lines), break and bomb, charge, chain start, payout, level up, curse, game over, buy, button click.
- Haptics on place, clear, chain step, bomb and game over. Android Chrome only; iOS browsers can't vibrate.
- UI fit:
  - Perk cards: one-line name, 2-line short text, and a cost/ACT/AUTO row.
  - The chain ribbon is one row and the tray hides during chains.
  - The info line is 2 lines max. Curses collapse into one chip ("☠ 3 · ×3.4").
  - The rack is taller (25% → 27%).
- New `sfx-test.html` page.

## v0.5 — Center-out Town map (2026-11-09)
- **The Town became a 5×5 open map**, replacing the polyomino building town. You own the center (Press House) and buy any tile touching an owned tile. Every reward is visible.
- Cost by distance: 15 / 35 / 60 / 110. Full map = 1,260 Ink.
- Rewards: perk and curse unlocks, +1 start charge, +10% EXP, +10% / +20% score, +1 slot (corners), Starter Kit.
- Old-town Ink carries over, with spending refunded. New **Refund all** button. The old module is kept as `meta-polyomino-v1.js`.

## v0.4 — Every clear is a chain, strict step order (2026-11-09)
- **New rule: clear a line → chain.** The ink gate and the Chains on/off toggle are gone. The placed piece's ink becomes the chain ink.
- Steps play strictly in order (highlight ~0.3s → resolve → pause ~0.55s), with numbered ribbon tokens: ①LINE CLEAR → ②DOMINO → ③GOLD DUST.
- The line clear always plays first, then the reactives it triggered, in rack order. The payout shows last.
- Card text uses **WHEN → DO**. Domino now fires on every line clear, once per chain.

## v0.3 — Domino opener trigger (2026-11-09)
- Domino could never fire with the starting perks. Now the line cleared by the piece that opens a chain also triggers Domino.

## v0.2 — Chain playback + aim (2026-11-09)
- Chain steps play one at a time (~0.5s apart, slow-mo). The card pops and a tag flies up (CRACK, CHAIN ×2, TOPPLE…).
- **Chain ribbon** of step tokens over the tray, plus a POT × MULT counter.
- **Drag to aim** targeted perks, with previews: Ink Bomb 3×3 outline with X marks, Shatter X, Overink cross with the new ink, Stamp ghost block. Invalid targets show grey.

## v0.1 — First prototype (2026-11-09)
- Full loop: title → run → level-up picks → game over → town → next run.
- 8×8 board, 3-piece tray, drag and drop with preview, and lines light up before they clear. Streak multiplier and **Pure line** bonus. The piece picker leans small when the board is full.
- 3 inks (R/Y/B). 6 cleared cells = 1 charge, max 3 per ink. Placing a piece of a charged ink opened a chain window. You spent charges on actives, and reactives fired free once per chain. Payout = pot × mult.
- **Last Ink:** one rescue chain when stuck with charges.
- Perks:
  - Actives: Shatter, Reprint, Ink Bomb, Overink, Stamp.
  - Reactives: Gold Dust, Domino, Echo, Prism, Spark, Siphon.
  - Passive: Thrift.
- Curses (×1.4–1.6): Narrow Press, Overclock, Rubble, Heavy Type, Short Feed. Every level-up pick includes 1 curse.
- Town: polyomino buildings paid with Ink (1 Ink per 50 score).
- Risograph art: paper grain, 8fps ink wiggle, offset shadows, ink-splat particles, pop text.
