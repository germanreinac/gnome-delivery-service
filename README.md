# Gnome Delivery Service

A top-down action game. You are a gnome courier with a roll of toilet paper roped to your back and a knife in your hand,
working out of a lobby hung in a sewer cavern.

## Play

Open `index.html` in a browser. No build step; three.js loads from a CDN.
Earlier versions are kept for reference: the 2D side-scroller in `2d/`, and the pipe run and maze versions in git history.

| Action | Keyboard | Touch |
| --- | --- | --- |
| Move | W A S D or arrows | Thumb stick |
| Dash | Space | Dash |
| Knife | X or J (hold to keep swinging) | Automatic when something is in reach; Knife button too |
| Paper wrap | C or K | Wrap |
| Use smoke | V or L | Smoke |
| Swap smoke | Q or 1 to 4 | Tap the smoke's name |
| Accept the next order | F or E | Tap the order list |
| Continue | Enter | Tap the screen |

## The shape of it

The lobby is home: other couriers hanging about, the roll pallet, the stores. There are two ways out.

- **West, down the stairs: the Underworld.** A freshly generated run of big chambers stepping deeper each time.
  Fight what lives there, pick up scrap, open stashes. The last chamber has a lift home and a way deeper:
  bank what you carry, or push on to a harder level with everything still at risk.
- **East, up the ramp: deliveries.** Accept orders in the lobby first (up to three), then climb the steel ducts under the
  streets to the bathroom pipes that ordered. Each drop pays tips and reputation and adds heat; past a point humans
  start hunting you from above. Covered ducts and cigar smoke hide you.

What you carry, tips or scrap, only counts once you take the lift home. Get knocked out or caught and it is gone;
the bank is safe. Scrap buys kit at the stores (smokes, a sharper knife); tips buy comfort (a bigger roll, quicker boots).
Reputation makes better-paying orders appear. Progress is kept in the browser's local storage where available.

## The world

Levels are height maps, not corridors: wide platforms at different heights over open air, joined by two-wide bridges
with stairs on them. You can step up one stair and drop any distance. Chambers have pits, a raised dais with a stash on it,
pillars, a back wall; some have a side room across a gap that only a dash clears. A pale strip marks every ledge.
Fall off and you lose 2 sheets and are put back where you last stood. Creatures that go over the edge are gone for good.

## Fighting

- The roll is cargo, health and ammo: orders use 3 to 5 sheets, hits tear off 1 to 3, a paper wrap costs 1.
  Hit with an empty roll and you are dragged home with empty pockets. Reload at the pallet in the lobby.
- Knife: slash, slash, then a spin that hits all round and throws things back. Each swing steps in to connect and aims
  itself at the nearest creature, marked with a red ring.
- Dash is a short burst that cannot be hit and carries across gaps. Strike out of a dash for a lunge that hits hard.
- Knock things off ledges: the spin, the lunge and the pipe's smoke ring all do it.
- Rats and mob gnomes telegraph: a red ring closes in, then they lunge, and a lunge does not look where it is going.
  Cockroaches nip on contact; cloglings hurt when they land on you.
- Paper wrap cocoons a creature; strike the cocoon to bowl it into the others.
- Smokes: cigarette (a decoy that runs off), pipe (a ring that shoves), cigar (a cloud that hides you),
  joint (leaves creatures too mellow to bite). You start with the cigarette.

## Code

Everything is in `game.js`. `genHub()` and `genRun()` build levels as height maps; `buildWorld()` turns one into meshes;
`step()` is the whole of the physics. `window.__gds.dev` exposes the generators for tinkering from the console.
