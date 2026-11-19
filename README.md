# Gnome Delivery Service

A 3D sewer-running delivery game. You are a gnome courier with a roll of toilet paper roped to your back.
Someone upstairs has run out. Get the roll through the pipes to their bathroom before they give up.

## Play

Open `index.html` in a browser. No build step; three.js loads from a CDN. The earlier 2D side-scroller is in `2d/`.

| Action | Keyboard | Touch |
| --- | --- | --- |
| Move | W A S D or arrows | Thumb stick |
| Jump | Space | Jump |
| Plunger whack | X or J | Whack |
| Continue | Enter | Tap the screen |

## How it works

- The roll is your health: 12 sheets. A bite costs 2, a dunk in the sewage costs 3. Zero sheets, no delivery.
- Each customer has an urgency timer. Sheets left and time to spare set the star rating and the tip.
- Rats patrol and charge, cockroaches skitter, cloglings (hair-clog blobs) hop at you.
- Spare rolls along the way restore 3 sheets.

Each level is one long bent pipe, described as data at the top of `game.js` (`LEVELS`): the path's bends and slopes, pits, bridges and crates, and a list of things to place. Gameplay runs in pipe coordinates (distance along, sideways, height), which are then wrapped onto the curve.
