# Gnome Delivery Service

A sewer-running delivery game. You are a gnome courier with a roll of toilet paper roped to your back.
Someone upstairs has run out. Get the roll through the pipes to their bathroom before they give up.

## Play

Open `index.html` in a browser. No build step, no dependencies.

| Action | Keyboard | Touch |
| --- | --- | --- |
| Run | ← → or A D | ◀ ▶ |
| Jump | Space, ↑ or W | Jump |
| Plunger whack | X or J | Whack |
| Continue | Enter | Tap the screen |

## How it works

- The roll is your health: 12 sheets. A bite costs 2, a dunk in the sewage costs 3. Zero sheets, no delivery.
- Each customer has an urgency timer. Sheets left and time to spare set the star rating and the tip.
- Rats patrol and charge, cockroaches skitter, cloglings (hair-clog blobs) hop at you.
- Spare rolls along the way restore 3 sheets.

Levels are data at the top of `game.js` (`LEVELS`): ground runs, floating pipes, and a list of things to place.
