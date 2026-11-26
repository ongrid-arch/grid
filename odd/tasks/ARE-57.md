# ARE-57: no false "rooms on both sides" note beside an outdoor balcony

## Outcome

- A balcony marked outdoor is the outside to the wall it stands against. A wall stated exterior
  that has a plate on one side and an outdoor balcony on the other, or open air beside a curved
  corner next to the balcony's side wall, gets no `wall/kind-differs` note.
- When the note does hold (a balcony drawn as a room that is not marked outdoor), it names the
  room on each side, not only one.

## Design

- Reproduced first, from a 40-storey tower of rounded plates with a balcony on every second
  floor, against the build the sample plans were first read with and against today's code. The
  older build gave two identical notes per balcony floor (the whole 6.05 m corner arc and a 0.10 m
  piece of the south wall, both naming only the plate); today's code gives none, because
  `sidesOf` in `packages/floorplan/src/geometry/exposure.ts` already counts an outdoor room as the
  outside (CNT-7) and counts a face that looks into another wall's body as neither a room nor a
  room's side (WRT-17). So no change to the geometry was needed.
- What this change adds is the regression test that was missing: in
  `packages/floorplan/src/geometry/__tests__/exposure.test.ts`, a plate with a quarter-arc corner
  and an outdoor balcony whose side wall ends where the arc begins. It holds the arc, the south
  wall and the validation to no note, and holds the same plan with the balcony not marked outdoor
  to one note on the shared wall that names both rooms.
- Not touched: a corner arc of a very small radius (about 1 m, no more than a few step widths)
  next to a wall body is worked out as inside, one-sided; it is out of this card.

## Done

- `exposure.test.ts` passes; it fails if the outdoor balcony is read as a room again.
- `ownWords.test.ts` and `tolerances.test.ts` pass; lint passes.
