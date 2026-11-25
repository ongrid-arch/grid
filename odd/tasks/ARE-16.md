# ARE-16: leave voids out of floor areas and the take-off

## Outcome

A room marked `void` (LVL-4) is open to the floor below: it has no floor. After this change it
adds nothing to a floor's net area, its gross internal or gross external area, its floor, its
ceiling or its skirting, and nothing to the inside total in the answer of a write. It is still
listed and measured, so a person sees its size, and its open edge gets a guard length: the metres
of its outline that no wall closes, which need a rail. A cabin of 18 m² with a loft void no longer
reads 36 m² gross internal, and a write no longer adds a void or an outdoor deck into "inside in all".

## Design

- `packages/floorplan/src/geometry/areas.ts`: a void room is in `RoomAreaFigure` with `void: true`
  and is in no counted figure (net, `byUse`, gross). A floor's `voids` holds their floor, and
  both gross figures are taken less it, as an outdoor space enclosed by the walls is. The rule
  text of each measure says so (`docs/areas.md` must match: a test holds them).
- `packages/cli/src/describe/facts.ts`: the room's facts carry `void` and the floor's `area`
  leaves it out, as it leaves out a zone or an outdoor space.
- `packages/cli/src/quantities/areas.ts`: `RoomArea.void`, and `inTotals` leaves it out.
- `packages/cli/src/quantities/takeoff.ts`: `roomTakeoff` gives a void floor, ceiling and
  skirting of 0, keeps its wall faces (the walls round it are still finished), and gives it
  `guard`, the length of edges with no solid wall, with a `guard` total. Finishes and the
  estimate read `roomTakeoff`, so they follow.
- `packages/floorplan/src/rooms/answer.ts`: rooms text cannot state a void yet, but it can state
  outdoor space, so `RoomFacts` of the compile carries `apart` and the summary adds up only the
  rooms that are floor, saying how much it left out.
- Decision: a void keeps its own net figure in its room line (measured, not counted), the way a
  zone and an outdoor space do, so nothing disappears from the listing.
- No new convention and no new message code.

## Done

- Tests that fail before: a floor with a void has the net, gross internal and gross external
  without it; the take-off gives it 0 floor, ceiling, skirting and a guard length; the totals of
  `planAreas` leave it out; the write summary leaves out outdoor space.
- `docs/areas.md` and the take-off rules say it; `changes/ARE-16.md` is written.
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run scoreboard`.
