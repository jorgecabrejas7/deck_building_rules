# For human revision

Recordings of the play table, one folder per step, newest step last. Each folder has `.mp4` videos (open them on
GitHub to play) and, where useful, `.gif` copies that show inline in the journal.

The journal with the explanation of every step and its screenshots is in
[`docs/table/README.md`](../docs/table/README.md).

**Start with the `all_in_one.mp4` inside each folder**: that feature's recordings in one captioned video. They are rebuilt whenever a step adds recordings. The other files in a folder are the same clips one by one. [`all_in_one.mp4`](all_in_one.mp4) here at the top is every feature in a row (about six and a half minutes).

How the recordings are made: a headless browser plays a real game against the local server, captured at quarter
speed and sped back up. They stutter more than a real phone does; judge where things go and in what order, not the
frame rate. File names say the screen (`portrait` 390×844, `landscape` 844×390, `desktop` 1440×900) and the action.

| Folder | One video | Step | What to look at |
|---|---|---|---|
| `01-glide-and-instant-actions/` | [watch](01-glide-and-instant-actions/all_in_one.mp4) | Step 1, commit `acc3d98` | Cards glide instead of blinking: play, tap, untap all, the other player's play and tap as you see them, play then undo. Recorded before the layout changed, so the rails and full-card tiles are the old ones. |
| `05-floating-layout/` | [watch](05-floating-layout/all_in_one.mp4) | Steps 2 to 5, commit `9544657` | The current two-player table: art tiles, floating controls, the bubbles. Seven actions on each screen: play a card, tap, open the bubbles and draw then untap all, the other player plays, the other player taps, play then undo, pass the turn (cancel once, then pass). |
| `06-multiplayer/` | [watch](06-multiplayer/all_in_one.mp4) | Steps 6 and 7, commits `0a539b8` and `869d081` | A four-player game. `follow`: the top battlefield follows the turn as it passes round the table. `strip`: tapping through the players strip. `portrait`: switching players on a phone held upright. |
| `07-feel/` | [watch](07-feel/all_in_one.mp4) | Step 8, commit `fd47e63` | The feel layer: a drag that lifts, tilts and is pulled into a zone; a drop on nothing flying back; a played card arcing from the hand; the hand as a fan whose cards part; the draw flip; the other player's draw; the untap ripple; the shuffle riffle with a die and a coin. |
| `08-look-and-sound/` | [watch](08-look-and-sound/all_in_one.mp4) | Step 9, commit `af60d2c` | The look: the mat, the seam and the light on the half whose turn it is, card shadows, the sheen on a dragged card, the enlarged card, a token and a face-down card, in light, dark and portrait. Sounds exist but cannot be heard in these recordings. |
| `09-token-lookup/` | [watch](09-token-lookup/all_in_one.mp4) | Step 10, commit `f0e0e07` | Token lookup: opening the sheet, searching and creating three tokens; the tokens your own cards make offered first; "one more" of a token in play; the sheet on a phone held upright. |
| `10-card-handling/` | [watch](10-card-handling/all_in_one.mp4) | Steps 11 and 16, commits `cd3dd86` and `7f57f5e` | Card handling: a double tap that opens a card's actions (a creature, a stack, a tapped card); holding a card shows it large and letting go opens the actions; the compact 3-column action panel beside the card in landscape; holding a card in the graveyard sheet; the library sheet with "how many from the top" at 1, steppers and quick numbers. Landscape and portrait. A yellow dot is a finger. |
| `11-tile-titles-and-two-faced-cards/` | [watch](11-tile-titles-and-two-faced-cards/all_in_one.mp4) | Steps 12 and 13, commits `e37fe50` and `fb4c352` | The name strip on battlefield tiles (a full board arriving, with tokens, counters and taps); Transform on Delver of Secrets and the large view with both faces; Play other face from the hand (Valki, God of Lies becomes Tibalt). Landscape and portrait. |
| `12-tokens-at-hand/` | [watch](12-tokens-at-hand/all_in_one.mp4) | Step 14, commits `fb4c352` and `f50de0b` | The token sheet with Your deck and Other decks; a token for yourself and one for another player in a 3-player game; the counter row; Copy on a creature with counters and on a token. Landscape and portrait. |
| `13-lobby-and-decks/` | [watch](13-lobby-and-decks/all_in_one.mp4) | Step 15, commits `e2b0f2b` and `f50de0b` | The Games tab with player chips and Create game; the lobby of two players on two screens (top and bottom in landscape, side by side in portrait): choosing a deck, Main / Sideboard / Maybeboard, moving a sideboard card to Main, Ready seen live by the other player, and the table opening when both are ready. |

New folders are added as steps are finished.
