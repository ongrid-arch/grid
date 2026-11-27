# CMD-50: edits name and move angled sides, and refuse a stretch that would distort

## Outcome

An agent moving a side of a room, or stretching a building, can name the side the way rooms text
names it and gets a building that keeps its shape:

- `grid_move_room_side` (and `grid edit move-side`) takes `side` as rooms text gives it: `north`,
  `east`, `south`, `west`, `ne`, `nw`, `se`, `sw` for an angled side (`north-east` and the like
  read the same), `east.2` when more than one side faces east (counted from the west, then the
  south, as rooms text counts them), a wall id on the room's outline, or `facing <room>` (also
  `the side facing <room>`) for the side the room shares with another, by id or name. A side
  not square to the drawing (a chamfer, a room turned 30 degrees) moves along its own normal: out
  of the room for a positive distance. Walls that end on it at an angle slide along their own
  line to its new place, so they keep their direction and the corners keep their angles; the
  side's own ends follow them. `to` sets the room's inside size measured across that side.
- A side name the room has no side for is refused with the room's sides, each named as rooms
  text would name it with its wall and length, so the agent can call again with one of them.
  Two sides facing one way, not in one line, are refused with `north.1`, `north.2` named.
- `grid_stretch` takes the eight compass words. When no wall faces the way asked (a building
  turned on the drawing), the stretch runs along the building's own axis nearest that way and
  says so; a building turned 45 degrees, where two axes are as near, is refused, naming both. A
  stretch that would turn a wall that crosses its line (a corner moving alone, making a kite of a
  room) is refused, naming the walls and how far each would turn, instead of being written.

## Design

- `packages/cli/src/edit/sideNames.ts` (new, pure): `roomSide(survey, room, name)` reads a side
  name and returns the room's edges on that side, its outward normal and the words for it. The
  eight compass directions are the drawing's (north is up), as in rooms text. A compass word
  matches the room's straight edges whose outward normal is within the same cone rooms text uses
  (cosine above 0.9); when one of them faces exactly that way (a square room), only the exact ones
  count, so every side that moved before moves the same now. Edges facing one way and in one line
  are one side (a side split into walls, WRT-59).
- `packages/cli/src/edit/edits.ts`: `moveRoomSide` takes a side name, finds it through
  `roomSide` and moves along its normal. A follower that meets the side square moves exactly as
  before; one at an angle has its end slid along its own line by `by / cos` (the end keeps its
  offset from the side's line), and the side wall's end at that corner moves with it. A follower
  nearly parallel to the side, or two followers at one end at different angles, is refused.
  `insideAcross` measures along any normal.
- `packages/cli/src/edit/fit.ts`: `sideMoveThatFits` and the rooms' least and most moves read the
  side's normal instead of a compass word.
- `packages/cli/src/edit/stretch.ts`: the stretch direction is a unit vector. A compass word with
  a straight wall facing it (within the rooms text cone) stretches that way as before; otherwise
  the plan's straight walls give the building's axes and the one nearest is used. Before any
  change, every wall with one end beyond the line must lie along the stretch, else it would turn:
  refused with each wall and its turn. Structural grids are carried when square to the stretch,
  whatever its direction.
- Tools: `side` in `grid_move_room_side` becomes a string read by `roomSide`; `grid_stretch`'s
  `side` takes the eight compass words. Their descriptions say what they take.
- Decision: `grid_add_room` keeps the four compass words; a room added against an angled side is
  not in this change (its new walls are laid square to the drawing).
- Decision: a stretch along the building's own axis is said in `guessed`, never silently.
- New sentences go into the message files (`edit.side.*`, `edit.stretch.*`), English and Spanish.
- No new message code; refusals are `EditRefused` as now.

## Done

- `packages/cli/src/edit/__tests__/angledSides.test.ts`: a room with a chamfer moves its `se`
  side out 0.5 m along its normal, its neighbours stay straight and keep their directions, the
  chamfer keeps its angle; `facing <room>` and a wall id move the same side as the compass word;
  `east.2` picks the second; a name with no side is refused listing the room's sides; a room
  turned 30 degrees moves its side along its normal; `to` sets the size across the side; every
  square case moves exactly as before.
- `packages/cli/src/edit/__tests__/stretchAxis.test.ts`: two rooms turned 30 degrees stretched
  `north` run along their own axis, every corner keeps its angle and the receipt says so; a
  building turned 45 degrees stretched `north` is refused naming its two axes; a stretch that
  would turn a chamfer is refused naming it; a square plan stretches as before.
- The edit and tool tests in `packages/cli/src/edit/__tests__` and `packages/cli/src/mcp/__tests__`
  pass, with `ownWords.test.ts`; `npm run build`, `npm run typecheck`, `npm run lint` exit 0.
