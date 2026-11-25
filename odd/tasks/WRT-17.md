# WRT-17: the rooms-text writer passes its own check

## Outcome

A plan `grid write` (and `grid_write_rooms`) writes from rooms text comes out of `grid check` with
no drawing note on a part the writer worked out itself, or it is not written. In particular:

- A room wider than the room beside it no longer leaves the wall between them stopping short of
  its corner (`wall/short`): the wall reaches the far room's corner wall, through the end of the
  near room's wall.
- Two rooms cut out of the corners of one room (two lifts in one lobby) no longer have their walls
  joined into one wall across the open floor between them, which closed off a slot of the lobby.
- A wall beside a 45 degree wall no longer leaves a gap between it and the next piece of the same
  room side (`wall/gap`).
- Walls of rooms that meet at three-way joints (honeycomb cells) are no longer called inside walls
  stated exterior (`wall/kind-differs`), from a stretch a millionth of a metre long.
- Rooms that ring floor no room claims (a floor wrapped round a core with no core room) are
  written with a warning that says where the floor is and how to write it, instead of written in
  silence and then noted by the check.
- Two openings that overlap on one wall (a window over the front door) are refused, by the
  check's own rule, instead of being warned about and then left out by the check.
- A door or window the check would leave out, or anything else the check finds as an error on the
  written plan, refuses the writing with the check's own words; a check note on the written plan
  that the writer has not already said is said in its answer, so no write is silent about one.
- A wall between two rooms takes the gap they leave; when that gap is a thickness no line states
  (a 0.6 m wall from rooms placed apart), the answer says so.

## Design

- `packages/floorplan/src/rooms/compile.ts`:
  - `buildWalls`: stretches on one line merge into one wall across a gap only where the bodies of
    walls crossing that line cover the gap; open floor between two stretches keeps them apart.
  - The ends: an end reaches the centre line of the wall it meets, as before, and then further to
    the centre line of a wall that makes a corner of one of its own rooms, when the bodies between
    are continuous (the overhang case).
  - The pieces of one room side that meet end to end are brought to one station: the thinner
    piece is carried on to the other's end when its new end stays inside another wall's body.
  - Openings: the overlap rule is the check's (`validateOverlaps`: any shared stretch on one wall
    is a clash), and a clash refuses the writing (`rooms/openings-overlap`, now a problem).
  - A wall between rooms whose thickness is no thickness the text states gets a warning
    (`rooms/wall-from-gap`).
  - After writing, the plan is read (`parseFloorPlan`) and checked (`validatePlan`): enclosed
    floor no room claims is warned of (`rooms/hole`); an error on a part the writer worked out
    refuses (`rooms/check`, the check's code and words); an error on a part written raw, and any
    warning the writer has not said already, is added to its warnings (`rooms/check`). This is
    `rooms/selfCheck.ts`. Pure: the check is pure too.
- `packages/floorplan/src/geometry/exposure.ts` (outside the card's area, one small change):
  neighbouring stretches of a wall with the same rooms merge into one whose worked-out kind is the
  longest piece's, not the first piece's. A sliver a millionth of a metre long at a three-way
  joint no longer decides a whole wall.
- The new words go into `messages/en.ts` and `messages/es.ts` as `rooms.*` keys.
- `docs/rooms-first.md` says what is refused and what the answer says.
- Decisions: the rooms codes (`rooms/*`) are the writer's own answer, not codes of the check's
  record, so they get no catalogue entry. Floor no room claims is refused rather than warned
  about, because rooms text has a way to say it (a room, `outdoor courtyard`, `-` for no use).
  No new convention.
- Decision, taken while building: floor no room claims is warned of, not refused. The lab's
  courtyard house is written that way on purpose (its original has the courtyard unclaimed), and
  a refusal would stop a plan that is right. The warning says how to claim it.
- Decision: a part written `raw` is the person's own JSON and is kept as written, faults included
  (the lab's two-storey house keeps two faulty windows on purpose); the check's error on it is
  said, not refused.
- Decision: an end of a wall meets the wall whose body it already stands in before a nearer
  centre line past it, and is carried on to a farther corner wall only past the distance the
  check reads as reached (half the thicker wall and `gap`), so plans that were clean keep their
  walls exactly (the lab's buildings and the school read-back are unchanged).
- Decision: a gap between two rooms that no line states no longer widens the stretch of outside
  face taken as the end of a wall seen end on; before, one odd 0.6 m gap let every stretch up to
  0.6 m of every outside face go without a wall.

## Done

- Tests in `packages/floorplan/src/rooms/__tests__/check.test.ts` that fail before the change:
  the overhang, the two lifts in one lobby, the 45 degree side, the honeycomb, the ring round a
  core, the window over the door, a 0.6 m gap, and 1500 generated layouts; each writes a plan
  with no note from `validatePlan` on its walls (or is refused, or warns, with its code).
- The lab's buildings still write as before (`buildings.test.ts`) and every rooms test passes.
- `changes/WRT-17.md`; `docs/rooms-first.md`.
- `npm run typecheck`, `npm run lint`, the floorplan tests, the ownWords and contract tests,
  `npm run scoreboard`.
