# LVL-12: courtyards are outside, and a roofed canopy has its roof

## Outcome

- Floor the walls enclose that no room on its floor claims is open to the sky when a window
  looks into it from a room, or when it lies over open outdoor space on the floor below (a
  courtyard, a light well, or open sky worked out the same way, floor by floor down). Open
  floor has no slab and no roof in the 3D view, the 3D files, the IFC and the section, and the
  check says nothing about it as floor no room claims.
- A courtyard or a light well on a floor above the lowest, over open outdoor space on the floor
  below, has no slab: the sky reaches down through every floor of it. A balcony, a terrace, a
  garden or any other outdoor space above the lowest floor stands on a slab, as before.
- A wall between a room and open floor faces outside, as a wall between a room and an outdoor
  space already does, in every view and export that reads the wall's exposure.
- Rooms text writes the wall between a room and an outdoor space (a courtyard, a terrace beside
  the house) as an outside wall: its kind is `exterior` and the room placed beside the other is
  set off by the outside thickness, unless a line states the wall or the rooms' own thickness.
- A roofed outdoor space has its roof when its floor has no building to roof with it: a petrol
  station's canopy on columns, drawn alone, is roofed at its stated height, else at the height
  of its tallest column, else at the storey's height.

## Design

- `packages/floorplan/src/geometry/openSky.ts` (new): `openSky(plan, index, floor)` works out,
  once per index, which enclosed spaces of a floor (`floorSpaces`) no room claims and are open:
  a window in a wall a room on the floor lists has that room on one face and the space on the
  other (probed just past both faces at the window's middle), or the space's inner point lies,
  on the floors of the next level down, in an unroofed outdoor space or in open floor of that
  floor (worked out the same way). `openBelow(plan, index, floor, point)` answers the second
  test for any point. The floor below is read from the plan's own levels (`planFloors`). Pure;
  it reads rooms' outlines, never the walls' exposure, so the exposure can read it.
- Why windows and not size or "a hole in the rooms": a forgotten wardrobe is enclosed by rooms
  too (ARE-4 keeps it floor), and a figure for a smallest courtyard would be a guess. A window
  says the person drew what lies past it as outside. A courtyard with no window into it and
  nothing open under it stays floor no room claims, and the check's fix already says to write
  it `outdoor courtyard`.
- `envelope.ts`: `openToTheSky` also cuts out the outline's spaces whose inner point lies in
  open floor; `outdoorOutlines` leaves a courtyard or light well over open space below out of
  the slab. A floor whose building outline is empty but which holds roofed outdoor space gets
  that roof; its underside is the space's stated `height`, else its tallest column's
  (`columnHeight`), else the storey's clear height. With the building on the same floor, the
  roofed space is roofed with the floor at the storey's height, as before: one roof per floor
  is what the views and the exports draw.
- `exposure.ts`: the test "floor the walls enclose that no room claims" (ARE-4) leaves open
  floor out, so a wall beside it faces outside.
- `validate.ts`: `floor/unclaimed` is not said for a piece of open floor.
- `rooms/compile.ts` (outside this card's area, kept to a few lines): the gap a room is placed
  at beside a single outdoor space, or an outdoor space beside a single room, is the outside
  thickness when no line states it; the wall worked out between them is `exterior` unless a line
  states its kind. Every outdoor kind counts, roofed or not, as the exposure already reads them.
- No new convention, field or message code. The gross areas (`areas.ts`) are not changed here:
  open floor that no room claims is still in the gross figures and in the areas' "belongs to no
  room" figure; a person can write the courtyard `outdoor courtyard` to take it off.

## Done

- `packages/floorplan/src/geometry/__tests__/openSky.test.ts`: four wings round a courtyard
  with windows into it: no slab or roof over it, its walls exterior, no `floor/unclaimed`; the
  same with no window keeps the note and the slab (ARE-4 kept); a two-floor courtyard drawn as
  an outdoor courtyard on both floors, and one drawn on the ground floor only, has no slab or
  roof over it on either floor, in the envelope and the section; a roof terrace over rooms keeps
  its slab; a canopy on columns alone is roofed at its columns' height and at a stated height.
- Rooms text: a courtyard and a terrace beside a room give an `exterior` wall at the outside
  thickness; a stated wall line still wins.
- `npx vitest run packages/floorplan`, `packages/cli/src/__tests__/ownWords.test.ts`,
  `npm run typecheck`, `npm run lint`, `npm run scoreboard`.
