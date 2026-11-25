# CNT-36: dividing lines and open sides on angled shared sides

## Outcome

A `wall between <a> and <b> virtual` line, or `open` on a room line, works on any side two rooms
share, square to the drawing or at an angle: the rooms get a dividing line along their shared
face and nothing else across it. Where the two rooms share no side, the line is refused by name,
naming both rooms and the rooms each does share a side with, so the writer never hands over an
outside wall across the mouth of a room the text opened. A polygon room written to the centimetre
against an angled side of another (a chapel off an apse, a bay off an octagonal hall) is found to
share that side, as a room written square against a square side is. What Grid writes from such a
text has no drawing problems it made itself, and every note the check makes is in the answer's
warnings.

## Design

- `packages/floorplan/src/rooms/compile.ts`, where shared sides are found: two faces of rooms
  face each other when they run the opposite way and their distance apart changes by no more
  than `roomsFaceSkew` over the shorter of the two faces. Today they must be parallel to the
  arithmetic's own precision, which corners written to the centimetre on an angled side never
  are, so the two rooms were taken as standing apart and each got its own outside wall across the
  shared side. The distance between them is measured at both ends of the stretch they share and
  the wall (or line) between them is laid along the earlier room's face at the mean of the two.
  Faces that are parallel, as every square side is, are measured as before, so a plan of square
  rooms is written as it was.
- Same file: after the walls of a floor are found, a pair of rooms opened to each other (a
  `virtual` wall line, or `open` on the room line) that shares no side is refused,
  `rooms/no-shared-wall`, the code a door between two such rooms already has, in Grid's own words
  in `messages/en.ts` (with its draft in `es.ts`). A solid `wall between` line with no shared
  side is left as it is: that is not this change.
- `packages/floorplan/src/geometry/tolerances.ts`: `roomsFaceSkew` (0.02 m), with its row in
  `docs/tolerances.md`; and `writtenParallel` (a sine of 0.001): two walls of one straight side
  whose directions differ by less than what writing their ends to a tenth of a millimetre leaves
  are parallel when the room's outline is traced.
- `packages/floorplan/src/geometry/room.ts` (outside the card's area, one small edit): `inRow`
  and `sameFace` read two walls as parallel by `writtenParallel`, not by the arithmetic's own
  limit. The outside wall beside a dividing line on an angled side stops at the centre line of
  the next room's side wall, as it does on a square side; the two then lie side by side, half a
  wall apart, and are one side of the room. With exact parallels only, the rounding of their
  ends made them two sides that meet kilometres away, and the writing was refused.
- No new convention in `types/floorplan.ts`: the schema is unchanged.

## Done

- `packages/floorplan/src/rooms/__tests__/angledOpenSides.test.ts`: a five-sided nave with a
  chapel against its angled side and one against its square side, both opened by
  `wall between ... virtual`, written exactly and written to the centimetre: each chapel has one
  dividing line along its mouth, no outside wall crosses it, no wall stands in a room and the
  answer has no warnings (`open` on a room line places a room square against another, so it
  has no angled case); a polygon hall with one angled bay and 1.8 m outside walls; an inside wall
  between rooms 0.15 m apart across an angled side written to the centimetre; a pair opened that
  shares no side is refused by name; and for each written plan every issue `validatePlan` finds
  is in the answer's warnings. These fail before the change, but the square chapel's, which
  holds it as it was.
- The rooms test folder, `packages/floorplan` whole, `ownWords.test.ts` (the tolerance table's
  count goes up by the two new descriptions), `tolerances.test.ts`, the type check, the lint and
  the scoreboard (no count worse).
