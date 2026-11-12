# The table: journal of the redesign

What changed on the play table, step by step, with a picture or a recording of each step.
Newest state first, then the steps in the order they were built. Each step is one commit, so any of them
can be undone on its own with a revert.

All recordings are in [`for_human_revision/`](../../for_human_revision/), as videos, one folder per step.
Recordings were captured at quarter speed in a headless browser and sped back up, so they stutter more than a real
phone does. Screenshots are 760×340 or 844×390 (phone landscape), 390×844 (phone portrait) and 1440×900 (desktop).

## Where things stand

| | |
|---|---|
| Live site | https://169-58-71-242.sslip.io/pod/ runs `main`. Every finished step is pushed there. |
| Work branch | `design`. A step is built and checked here, then pushed to `main`. |
| Before all this | Tag `before-table-redesign` (commit `91cb3df`). |
| Undo a step | `git revert <commit>` on `main` and push. The server follows `main` forward only, so never force-push. |
| Checks | Seven commands, listed at the end. All pass at every commit below. |

### What is live (after step 8)

Games of 2 to 6 players; the pictures of that are under steps 6 and 7. The two-player table:

Landscape is the main design. Both battlefields take the whole width, rows are centred, and every control floats.

![Landscape, light](img/05-floating-landscape.jpg)
![Landscape, dark](img/05-floating-landscape-dark.jpg)

One round button opens the actions as bubbles. Passing the turn arms for 1.5 s and can be cancelled.

![Bubbles](img/05-bubbles.jpg)
![Pass armed](img/05-pass-armed.jpg)

Portrait and desktop share the same controls.

<img src="img/05-floating-portrait.jpg" width="300" alt="Portrait"> ![Desktop](img/05-floating-desktop.jpg)

Videos of the current two-player table are in [`for_human_revision/05-floating-layout/`](../../for_human_revision/05-floating-layout/); of a four-player game, in [`06-multiplayer/`](../../for_human_revision/06-multiplayer/).

### Known weak spots (told to Jorge, not fixed yet)
- On short phones, landscape tiles are 12 to 16% smaller than they were with a side rail, because every row is
  centred on the screen and must clear the corner pills on both sides.
- An opponent with many lands gets three rows instead of two at 760×340.
- Portrait leaves a large gap between your creatures and your lands when the board is small.
- The multi-select bar covers the opponent's life pill in landscape.
- The menu still lists Log and Full screen, which the bubbles also have.
- Nothing here was checked on a real phone by the developer; Jorge and his testers are doing that.

## The starting point

Cards blinked from one place to another, every tap waited for the server, and phone landscape put two half-width
boards side by side with cards 32 to 41 px wide.

![Before, landscape](img/00-before-landscape.jpg)
<img src="img/00-before-portrait.jpg" width="300" alt="Before, portrait">

## Step 1 — Cards glide, actions apply at once (`acc3d98`)

- A card keeps its id when it moves; only a shuffle issues new ids. Hidden names behave as before.
- Each card keeps one element on the page and glides to its new place. Nothing animates under reduced motion.
- Tap, untap all, life, counters, commander damage, attach and visible moves show before the server answers.
  A rejected action glides back. `scripts/test_table_predict.js` replays random games through the server's
  reducer and the browser's predictor and fails if they disagree.
- Undo is one button; the toast after every action is gone. Passing the turn has a cancel window.

Play, tap, and undo on a phone:

<img src="../../for_human_revision/01-glide-and-instant-actions/play-portrait.gif" width="240" alt="Play a card"> <img src="../../for_human_revision/01-glide-and-instant-actions/tap-portrait.gif" width="240" alt="Tap"> <img src="../../for_human_revision/01-glide-and-instant-actions/undo-portrait.gif" width="240" alt="Play then undo">

The other player's card arriving, as you see it:

![Opponent plays, desktop](../../for_human_revision/01-glide-and-instant-actions/opponent-desktop.gif)
![Opponent plays, landscape](../../for_human_revision/01-glide-and-instant-actions/opponent-landscape.gif)

## Step 2 — Drag at once, slide to see cards large, quick zones (`ae222a1`)

Asked for after the first phone test.

- A finger on a card that moves drags it at once.
- Sliding over cards from an empty spot shows each one large. A pressed hand card is shown large too.
- While a card is dragged, a tray offers hand, graveyard, exile and library top or bottom.
- A draw button, and a full-screen button on every phone.

<img src="img/02-zoom-portrait.jpg" width="240" alt="Zoom"> <img src="img/02-hand-zoom.jpg" width="240" alt="Hand zoom"> <img src="img/02-tray-portrait.jpg" width="240" alt="Tray"> <img src="img/02-draw-button.jpg" width="240" alt="Draw button">

![Tray in landscape](img/02-tray-landscape.jpg)

## Step 3 — Phone landscape, first attempt: stacked boards with a side rail (`7ff7e1e`)

Opponent on top, you at the bottom, a left rail for life and buttons, piles on the right, a hand that peeks.
Jorge's verdict: better, but the rail takes too much space. Replaced in step 5.

![Stacked](img/03-landscape-stacked.jpg)
![Stacked, dark](img/03-landscape-stacked-dark.jpg)
![Hand pressed](img/03-landscape-hand-press.jpg)

## Step 4 — Permanents as art tiles; press to enlarge (`617384f`)

- A permanent is its artwork in a wide tile with a colour frame and power/toughness or loyalty. No card text:
  the full card shows when you press or hover.
- A tapped permanent tilts and dims instead of turning 90 degrees.
- Press a card to see it large, move away to drag it, quick tap to tap it, double tap for its actions.
  "Select several" moved into the action bar.

![Tiles, landscape](img/04-tiles-landscape.jpg)
<img src="img/04-tiles-portrait.jpg" width="300" alt="Tiles, portrait"> ![Tiles, desktop](img/04-tiles-desktop.jpg)

## Step 5 — The battlefield takes the whole screen (`9544657`)

- No rails, pile columns or hand head. Rows are centred on the screen.
- A life pill per player with zone chips beside it. A chip opens its pile, takes drops, and is where cards fly to.
- Pass turn on the right edge. One translucent button opens the bubbles.

The pictures are at the top of this page. A crowded board at 760×340:

![Crowded](img/05-crowded-landscape.jpg)

## Step 6 — The server runs games of 2 to 6 players (`0a539b8`)

Nothing to see on screen in this step.

- Seats are 1 to N. Cards that were known to "both" players are known to every player.
- Commander damage is kept per player it comes from, because two players may run the same commander.
- The turn goes to the next player in order who is not out. A player can mark themselves out or back in.
- The limit of 600 is on tokens, not on all cards.
- The predictor and its parity test cover 2, 3, 4 and 6 players. The fuzz test checks that no hidden card name
  reaches any player, with 2, 3 and 6 players.
- With 6 players and 100-card decks, an action takes 3.8 ms on average and the stored game is about 205 KB.

Games saved before this step used the old commander-damage shape and had to be ended.

## Step 7 — The screen for 3 to 6 players (`869d081`)

The screen still shows two battlefields: yours and one other player's.

- The top battlefield follows the turn. Choosing someone by hand holds until the next turn change.
- A strip of small pills shows every other player's name and life, whose turn it is, and who is out. Tap one
  to see their battlefield. The same players are bubbles in the action menu.
- A player who is not on top glows when they act, and their life change floats at their pill.
- One commander-damage chip per player, showing the highest damage from a single commander. It opens a sheet
  with every opponent's commanders.
- Giving control asks which player. "I'm out of the game" is in the menu.
- The Partidas form invites one to five pod members.

The top following the turn, and tapping through the strip:

![Following the turn](../../for_human_revision/06-multiplayer/follow.gif)
![The strip](../../for_human_revision/06-multiplayer/strip.gif)

Four players, and six with the bubbles open:

![Four players](img/06-four-players.jpg)
![Six players, bubbles](img/06-six-players-bubbles.jpg)

A player who is out, and giving control to a chosen player:

![Player out](img/06-player-out.jpg)
![Give control](img/06-give-control.jpg)

On a phone held upright: switching players, six players, commander damage, the lobby, and the invitation form.

<img src="../../for_human_revision/06-multiplayer/portrait.gif" width="240" alt="Portrait"> <img src="img/06-six-players-portrait.jpg" width="240" alt="Six players"> <img src="img/06-commander-damage.jpg" width="240" alt="Commander damage"> <img src="img/06-lobby-six.jpg" width="240" alt="Lobby"> <img src="img/06-invite-form.jpg" width="240" alt="Invitation form">

Not checked or weak in this step:
- Some screenshots show card names instead of art because the art had not loaded in the test browser.
- The strip's pills are bright in the light theme.
- The first-time hint for the strip, and giving control in portrait, were not exercised.
- With three or more players, a card moved into another player's hand waits for the server instead of moving at once.

## Step 8 — The feel layer (`fd47e63`)

- **Drag.** The dragged card is a copy of its own tile. It lifts from its slot, tilts with the speed of the
  finger, and is pulled into zone chips, tray targets and hosts when it comes near. On release it carries on
  into its new place. Dropped on nothing, it flies back.
- **Hand.** Cards sit on an arc. The raised card straightens and grows and its neighbours part. With 20 cards on
  a phone the raised card is 95 px wide or more.
- **Flights.** A played card arcs from the hand. A card returning to the hand lands at its fan angle.
- **Draw.** A card you draw flips face up on the way. The other player's draw flies as a card back.
- **Untap all** ripples across your permanents. A **shuffled** library's chip riffles. A **die** tumbles before
  it settles and a coin spins; a screen reader hears the result once, when it lands.
- The multi-select bar no longer covers a life total. The menu no longer repeats Log and Full screen.

Nothing in this step animates under reduced motion.

![Drag to the graveyard](../../for_human_revision/07-feel/drag_to_graveyard.gif)
![Sliding along the hand](../../for_human_revision/07-feel/hand_fan_slide.gif)
![The draw flip](../../for_human_revision/07-feel/draw_flip.gif)

<img src="img/08-hand-arc-portrait.jpg" width="300" alt="Hand arc, portrait"> ![Hand arc, landscape](img/08-hand-arc-landscape.jpg)

Not checked or weak in this step:
- A card dragged from the hand changes from the full card to the wide art tile at the moment of release.
- When several cards are dragged together, only the one under the finger flies from where you let go.
- The pull radius near a chip (about 40 px) was chosen by eye, not tuned with a finger.
- The clips were captured with the pointer moving four times slower than a hand, so the tilt in them is milder
  than it will feel.
- The untap ripple was verified with 3 to 6 permanents, not more.

## What comes next, in this order

1. The look: playmat, card shadows, optional sound.
2. Token lookup with art and power/toughness.
3. Fixes from Jorge's and his testers' phone tests, as they arrive.

New steps are added below as they are built.

## The checks

Run from the repository root; all must pass before a commit.

```
node scripts/test_engine_parity.js
node scripts/test_i18n.js
node scripts/test_table_log.js
node scripts/test_table_predict.js
python3 scripts/tier_rules.py --calibrate
cd server && python -m pytest
```
