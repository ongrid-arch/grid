# CNT-31: the estimate's labels, rate keys and measures

## Outcome

A person or an agent who asks `grid_takeoff` for an estimate gets lines a builder can price as
they stand:

- every room use has its own words on its lines (no line reads "undefined");
- the rate card Grid writes, filled in and saved as the rates file, is read back as it is: every
  key the estimate writes, typed walls, doors and windows and named finishes among them, is a key
  the rates file takes, and prices its line;
- a floor that states a sloped roof has its roof priced on the slope, with the lengths a roof kit
  is ordered by: ridge, eaves, verges and hips;
- walls are measured between the faces of the walls they meet, so a partition that butts into
  another wall is not counted into it;
- an upper floor's structure leaves out every opening its slab has: stairs, stair rooms, lifts,
  voids and ramps;
- an open outdoor space (a deck, a terrace) has no slab under it on the ground, no roof and no
  ceiling over it.

## Design

All in `packages/cli/src/quantities/estimate.ts` and `rates.ts`, reusing the core's measuring:

- Use words: `USE_WORDS` becomes a record over every room use (typed, so a use added to
  `ROOM_USES` fails the type check until it has its words).
- Rate keys: the first word stays small letters (now with `-`, for `wall-type` and `door-type`),
  and what follows the first colon is the plan's own text (type ids and finish names, which may
  hold capitals, spaces and accents), one line with no control character. The longest key goes up
  to 200 characters, enough for a finish name of 120. A round-trip test writes the rate card of a
  plan with every kind of line and reads it back as a rates file.
- Walls: each wall's length is the mean of its two faces' lengths once the corners are joined
  (`wallJoints`, the same joints the drawing uses). At a corner that is its centre line, as
  before; where it butts into another wall it stops at that wall's face.
- Slab, upper floors and roof come from `planEnvelope` (the take-off's own source) instead of the
  outline alone: the slab is the base slab as built, an upper floor is its gross internal area
  less its slab's openings, the roof is on its slope where the floor states one. Ridge, eaves,
  verge and hip lengths are worked out from the roof's planes over the extent of its pieces
  (`roofLengths`); they are lines of their own (`ridge`, `eaves`, `verge`, `hip`, in m), so a
  rate for `roof` per m² still prices only the roof.
- Ceilings: an outdoor space that is not roofed has none.

Decisions: the wall rule now applies to every wall kind, not only partitions, because a corridor
wall butting into an outside wall overlapped it the same way; corner walls are unchanged. The
lengths of a sloped roof are worked out over the rectangle its pieces span, as Grid lays the roof
(one roof, no valleys), and are marked assumed.

## Done

- `packages/cli/src/mcp/__tests__/estimate.test.ts`: the hand-worked figures of the 26-room floor
  moved where walls butt into others; new cases for every use's words, the rate card's round
  trip, a gable roof on its slope with ridge, eaves and verges worked by hand, a void taken out
  of an upper floor, and an open deck with no slab, roof or ceiling.
- `npm run typecheck`, `npm run lint`, `npx vitest run packages/cli`, the words and tolerance
  tests, and the scoreboard no worse.
