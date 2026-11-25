# WRT-56: nearly parallel polygon faces share one wall

## Outcome

Two polygon rooms written rooms first whose facing sides are a few degrees out of parallel, a
wall's width apart along all they share, get one wall between them, as a phone room scan read in
does: no outside wall on each side of a partition, laid over each other. The wall runs along the
middle line between the two sides and is as thick as the gap at the middle of what they share. The
rooms keep the corners as written, and the answer says once per floor which rooms' sides are out
of parallel, by how many degrees at most, and how far a wall's face is off a side, so a person
checking a survey knows where the drawing departs from what was written.

## Design

- `packages/floorplan/src/rooms/compile.ts`, the face pairing in `derive`: two faces that run the
  opposite way now face each other when they are no further than `roomsFaceTurn` out of parallel
  (the sine of 5 degrees, the scan's own `scanFaceTurn` figure, held in the rooms section of the
  table) and the gap at both ends of the stretch they share is between nothing and a wall's width
  (`roomsWallWidest`). Faces within CNT-36's `roomsFaceSkew` along the shorter pair as before,
  however far apart they are, so plans that wrote before write the same.
- A wall between faces out of parallel by more than `roomsFaceSkew` is drawn from the middle of the
  gap at one end of the shared stretch to the middle at the other, so it lies midway between the
  two sides, not parallel to one of them; its thickness stays the gap at the middle (the same rule
  CNT-36 uses). A pair turned further than CNT-36 allows that is wider than a wall at either end is
  left as it was: two faces apart, with the gap check as before.
- A new warning, `rooms/faces-turned`, once per floor in the rooms compiler's own codes (like
  `rooms/wall-from-gap`, not a check code in the catalogue), with its words in `messages/en.ts` and
  `messages/es.ts`. It names up to six pairs of rooms and how many more.
- `roomsFaceTurn` gets its row in `docs/tolerances.md`; `docs/rooms-first.md` says what a side
  out of parallel gets.
- Decision: the rooms are not turned to match the wall (the scan import turns its own faces,
  because a scan has no corners a person wrote). A person's corners are kept and the difference is
  said; that is the easiest choice to undo.

## Done

- `packages/floorplan/src/rooms/__tests__/turnedFaces.test.ts`: a 115 mm partition between two
  rooms 0.8 and 2 degrees out of parallel writes one interior wall between them, along their middle
  line, with no outside wall across it, one `rooms/faces-turned` warning and no `wall/duplicate`
  from the check; a ring of polygon rooms on a curve with a 0.1 m gap writes interior walls only;
  faces turned further than 5 degrees, or wider apart than a wall at one end, are not paired;
  CNT-36's centimetre-rounded sides stay silent.
- `npx vitest run packages/floorplan`, `ownWords.test.ts`, `tolerances.test.ts`, typecheck, lint
  and the scoreboard, no count worse.
