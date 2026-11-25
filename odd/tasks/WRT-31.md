# WRT-31: a wall that faces outdoor space is the building's outside wall, whatever placed it

## Outcome

Rooms text writes the wall between a room and outdoor space (a garden, a terrace, a balcony, a
porch, a courtyard) as the building's outside wall in every way the rooms can be placed, and the
plan file, the check and the IFC give one answer for it:

- Its kind is `exterior` and its thickness is the outside walls' thickness, unless a
  `wall between` line states the wall, or the room's own `walls` states its walls.
- An outdoor space's own `walls` (its railing, its fence, its paving edge) does not make the
  building's wall thinner: a balcony written `walls 0.05` beside a living room leaves the living
  room's facade at the outside thickness.
- An outdoor space placed beside a placed unit of rooms (a row of group rooms, a flat written
  once), or a unit's room beside one, is set off by the outside thickness, as beside one room.
- An outdoor space cut out of a room's corner (`inside <room> corner ...`, a recessed balcony) is
  set off by the outside thickness, and its wall to the room is `exterior`.
- A window between a room and outdoor space is a window in an outside wall: the write no longer
  warns that it is in an inside wall (`rooms/inside-window`).
- When rooms placed by hand (`at x,y`) leave a gap between a room and outdoor space that is not
  the outside thickness and no line states it, the write says so once, with the wall line that
  keeps the gap if it is meant (`rooms/wall-from-gap`).
- The file's kind, the drawing check (no `wall/kind-differs`, no
  `opening/window-between-rooms`) and the exposure the IFC writes as `IsExternal` agree.

Already true on main and kept: the simple case (an outdoor space `south of` one room) is
`exterior` at the outside thickness (LVL-12), and a write's inside total leaves outdoor space out
(ARE-16).

Not in this change: what an outdoor space's free edges are (an open edge, a railing, a fence).
They stay outside walls at the outside thickness and the storey's height, as today; that is a
change of its own.

## Design

All in `packages/floorplan/src/rooms/compile.ts`, with its words in the message files:

- `gapBetween`: after a `wall between` line's thickness, a placement where every room placed
  against faces outdoor space with the new room (one room or a unit's rooms) is an outdoor pair.
  For it only the building rooms' own `walls` counts, never the outdoor space's; with none, the
  gap is the outside thickness. Every other placement is as before.
- `placeInside`: a room cut out of a corner, where one of the two is outdoor space, takes the
  line's `wall <t>`, else the building room's own `walls`, else the outside thickness; an
  outdoor space's own wall kind is not set on that wall (the worked-out kind, `exterior`,
  stands).
- The opening placer: `rooms/inside-window` is not said when the other side of the wall is
  outdoor space (the check's `opening/window-between-rooms` already reads the wall's exposure).
- The worked-out walls: for a wall between a room and outdoor space, a gap is "stated" only when
  it is the outside thickness or a thickness a line states, not merely the inside thickness, so
  a hand-placed gap of the inside thickness is said with `rooms/wall-from-gap`, in its own words
  (`rooms.wallFromGap.outdoor`, English and Spanish).
- Decision: LVL-12 let "the room's own `walls`" set this wall. That stays for a building room's
  `walls`, which is the building's wall; it no longer holds for an outdoor space's `walls`,
  which describes the space's edges, not the building. `docs/rooms-first.md` says so.
- No new convention, field or message code; the read-back (`read.ts`) needs no change, since it
  checks its reading by writing it again with the same compiler.

## Done

- `packages/floorplan/src/rooms/__tests__/outdoorWall.test.ts`, each failing on main before the
  change where it is new:
  - a balcony with its own `walls 0.05` south of a living room: the wall between is `exterior`
    at the outside thickness;
  - a garden south of a repeated unit's rooms and a balcony south of a placed unit: `exterior`
    at the outside thickness;
  - a recessed balcony cut out of a room's corner: `exterior` at the outside thickness;
  - windows from the group rooms into the garden: no `rooms/inside-window`;
  - a terrace placed by hand at the inside thickness: `rooms/wall-from-gap` said once, and a
    `wall between` line with that thickness silences it;
  - for each: the plan's wall kind, `wallExposure` (what the IFC writes) and the IFC's
    `IsExternal` agree, and `validatePlan` gives no `wall/kind-differs` or
    `opening/window-between-rooms`;
  - each reads back as rooms text and writes again to the same walls.
- `npx vitest run packages/floorplan`, `packages/cli/src/__tests__/ownWords.test.ts`,
  `npm run typecheck`, `npm run lint`, `npm run scoreboard`.
