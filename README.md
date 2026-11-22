# Gnome Delivery Service

A 3D sewer delivery game. You are a gnome courier with a roll of toilet paper roped to your back,
running orders through a labyrinth of pipes and vents under the city.

## Play

Open `index.html` in a browser. No build step; three.js loads from a CDN.
Earlier versions are kept for reference: the 2D side-scroller in `2d/`, and the single-pipe 3D run in git history.

| Action | Keyboard | Touch |
| --- | --- | --- |
| Move | W A S D or arrows | Thumb stick |
| Dash | Space | Dash |
| Plunger whack | X or J | Whack |
| Paper wrap | C or K | Wrap |
| Use smoke | V or L | Smoke |
| Accept the next order | F or E | Tap the order list |
| Swap smoke | Q, E or 1 to 4 | Tap the smoke's name |
| Continue | Enter | Tap the screen |

## The loop

Push your luck: go out, earn, and decide after every drop whether to risk one more or walk home and bank it.

1. **Lobby.** A safe common room where other couriers hang about. Orders ping your app; accept the ones you want
   (F, or tap the list), up to three. Reload at the roll pallet. Spend at the stores in the corner.
2. **The run.** Head out through one of the lobby's four pipes. Tips go in your **pocket**, not the bank.
   Every delivery adds **heat**: creatures notice you sooner and chase harder, and past the mark on the heat bar
   humans start hunting. There is no clock.
3. **Cash out.** Walk back into the lobby and the pocket is banked, heat clears, and the sewers repopulate.
   Get knocked out or grabbed first and the pocket is gone. The bank is always safe.
4. **Spend.** The stores sell the pipe, cigar and joint, a bigger roll (16, then 20 sheets), the knife, and a map
   of each district you have opened.
5. **Go further.** Each delivery banked is a point of reputation (two for a back-room package).
   Reputation opens the gated pipes.

| District | Opens at | Main threat | Tips |
| --- | --- | --- | --- |
| Rat Runs (north) | start | rats; the back room is here | x1 |
| Mob Turf (east) | reputation 3 | mob gnomes with knives, and their den | x1.3 |
| The Flood (south) | reputation 7 | sewage everywhere, cloglings | x1.6 |
| High Street (west) | reputation 12 | heat climbs fast, so humans come quickly | x2 |

Districts only join through the lobby, apart from vents, which cut between them for a roll of 6 sheets or fewer.
Progress (bank, reputation, purchases) is kept in the browser's local storage where that is available.

## Tools and threats

- The roll is cargo, health and ammo: orders use 3 to 6 sheets, a bite or a dunk in sewage tears off 1 to 3,
  a paper wrap costs 1. Vents only fit a roll of 6 sheets or fewer; creatures cannot follow you in.
- Paper wrap cocoons a creature for a few seconds. Whack the cocoon to bowl it into the others.
- Smokes (V to use, Q or 1 to 4 to swap, each with its own relight time): cigarette makes a gnome-shaped smoke decoy
  that runs off; pipe blows a ring that shoves creatures back; cigar lays a cloud that hides you; joint leaves
  creatures too mellow to bite. You start with the cigarette.
- The back room hands out steroid packages for a gym duct in any open district. The duct is narrow, so the roll must
  be 6 sheets or fewer to post it. Big pay, a lot of heat.
- Mob gnomes stop, wind up and lunge with a knife: 3 sheets, and they take the package. Beat one and it drops its knife.
- Humans track you with a reticle, shoot four times (3 sheets each), then a hand comes down to grab you.
  Keep moving, or stand in a vent or cigar smoke until they lose you. Shots also kill creatures under them.
- It plays as a top-down action game: a fixed overhead camera that never turns, so the stick maps straight onto the floor.
- Dash is a short, fast burst. It crosses a sewage channel and you cannot be hurt during it.
- Attacks aim themselves at the nearest creature in view, marked with a red ring. Hold Whack to keep swinging;
  every third swing in a row is a heavy hit.
- Rats and mob gnomes telegraph: they stop, a red ring closes in around them, then they lunge. They only hurt on the
  lunge. Cockroaches nip on contact (1 sheet); cloglings hurt when they land on you.

The map is generated from a seed in `generate()` in `game.js`: one depth-first maze per district, each starting behind its
lobby pipe and never crossing into another, then loops, chambers, delivery points, gym ducts, vents and sewage.
