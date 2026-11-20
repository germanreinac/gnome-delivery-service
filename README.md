# Gnome Delivery Service

A 3D sewer delivery game. You are a gnome courier with a roll of toilet paper roped to your back,
running orders through a labyrinth of pipes and vents under the city.

## Play

Open `index.html` in a browser. No build step; three.js loads from a CDN.
Earlier versions are kept for reference: the 2D side-scroller in `2d/`, and the single-pipe 3D run in git history.

| Action | Keyboard | Touch |
| --- | --- | --- |
| Move | W A S D or arrows | Thumb stick |
| Jump | Space | Jump |
| Plunger whack | X or J | Whack |
| Paper wrap | C or K | Wrap |
| Use smoke | V or L | Smoke |
| Swap smoke | Q, E or 1 to 4 | Tap the smoke's name |
| Continue | Enter | Tap the screen |

## The loop

- There is no clock. Orders come in from bathrooms around the map; take them in any order and find your own route.
  Faster deliveries tip slightly better, nothing more.
- The roll is cargo, health and ammo: 12 sheets. Orders use 3 to 6 sheets, a bite or a dunk in sewage tears off 2,
  a paper wrap costs 1. Reload at the depot any time.
- Vents are shortcuts through the rock, but only a roll of 6 sheets or fewer fits. Creatures cannot follow you in.
- Paper wrap cocoons a creature for a few seconds. Whack the cocoon to bowl it into the others.
- Smokes are the second tool. Swap with Q, 1 to 4, or by tapping the smoke's name; each has its own relight time.
  - Cigarette: a gnome-shaped smoke decoy runs off the way you face. Creatures chase it and are stunned when they catch it.
  - Pipe: a smoke ring rolls forward and shoves creatures back, into sewage if it is there.
  - Cigar: a thick cloud. Creatures inside choke, and cannot see you while you stand in it.
  - Joint: a haze that leaves nearby creatures too mellow to chase or bite for a while.
- Hit with an empty roll and you are dragged back to the depot and lose 5 tips.
- The map shows only what you have explored, plus where the open orders are.
- A shift is 8 orders. Each shift is a new maze.

The maze is generated from a seed in `generate()` in `game.js`: a depth-first maze with extra loops, three chambers,
delivery points at far dead ends, vents where the walk around is long, and sewage across straight corridors.
