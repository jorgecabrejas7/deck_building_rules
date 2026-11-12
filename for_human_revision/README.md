# For human revision

Recordings of the play table, one folder per step, newest step last. Each folder has `.mp4` videos (open them on
GitHub to play) and, where useful, `.gif` copies that show inline in the journal.

The journal with the explanation of every step and its screenshots is in
[`docs/table/README.md`](../docs/table/README.md).

**Start with the `all_in_one.mp4` inside each folder**: that feature's recordings in one captioned video. They are rebuilt whenever a step adds recordings. The other files in a folder are the same clips one by one. [`all_in_one.mp4`](all_in_one.mp4) here at the top is every feature in a row (about 80 seconds).

How the recordings are made: a headless browser plays a real game against the local server, captured at quarter
speed and sped back up. They stutter more than a real phone does; judge where things go and in what order, not the
frame rate. File names say the screen (`portrait` 390×844, `landscape` 844×390, `desktop` 1440×900) and the action.

| Folder | One video | Step | What to look at |
|---|---|---|---|
| `01-glide-and-instant-actions/` | [watch](01-glide-and-instant-actions/all_in_one.mp4) | Step 1, commit `acc3d98` | Cards glide instead of blinking: play, tap, untap all, the other player's play and tap as you see them, play then undo. Recorded before the layout changed, so the rails and full-card tiles are the old ones. |
| `05-floating-layout/` | [watch](05-floating-layout/all_in_one.mp4) | Steps 2 to 5, commit `9544657` | The current two-player table: art tiles, floating controls, the bubbles. Seven actions on each screen: play a card, tap, open the bubbles and draw then untap all, the other player plays, the other player taps, play then undo, pass the turn (cancel once, then pass). |
| `06-multiplayer/` | [watch](06-multiplayer/all_in_one.mp4) | Steps 6 and 7, commits `0a539b8` and `869d081` | A four-player game. `follow`: the top battlefield follows the turn as it passes round the table. `strip`: tapping through the players strip. `portrait`: switching players on a phone held upright. |

New folders are added as steps are finished.
