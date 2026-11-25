# WRT-44: every read-back writes back, and a wall with no length never stops Grid

## Outcome

What `grid describe --as rooms` (and `grid_describe` as rooms) gives back, `grid write` takes,
for any plan, copied floors included, and a wall with no length (its two ends one point) is
never an internal error:

- A door as wide as its room's side stays a door line when it is read back. The plan file holds
  lengths to a tenth of a millimetre, so a 6 ft door on a 6 ft corridor can come back a hair
  wider than the corridor as the file holds it (1.8288 m on 1.82875 m). The read-back writes such
  an opening to fit the side as the text writes it, so writing the text again takes it, on every
  copied floor too.
- The writer never writes a wall with no length. Where two outside walls stand closer than their
  own thickness (the notch between two flats of a row whose bedroom wing is wider than its living
  wing), the short outside wall between them was worked out with both ends at one point, and the
  plan was refused by its own check, with no line named. That wall is left out now: the walls
  beside it cover the place, and the rooms are bounded as before. A door written in such a place
  is refused with its line.
- A `raw wall` line whose two ends are one point is refused with its line, saying so, where the
  writer used to throw and Grid said something went wrong inside it.
- A plan written before this change that holds a wall with no length reads back without it: the
  read-back says in a comment line which wall it leaves out and why (the check leaves it out of
  the plan too), so writing the text again neither refuses it nor keeps a part nothing can build.
- Writing rooms text over such a plan (`grid write --replace`) compares the plans without
  stopping on that wall.

## Design

- `packages/floorplan/src/rooms/read.ts`:
  - `buildable`: the plan as read back, without its walls of no length, their ids out of the
    room boundaries and the openings in them out too, each named in `leftOut` and in a comment
    line at the top of the text. Everything after reads that plan; the `based on` line keeps the
    file's own revision, so the write is not taken for a stale one.
  - `openingLine`: the side is measured as the text writes it (the room line's rounded corners,
    `writtenCorners`). An opening that runs past an end of it by no more than twice the tenth of
    a millimetre the file holds (two rounded ends) is written to fit: its start at the end, its
    width to the other end. The draft records the opening as `fitted`, and the comparison takes
    its width and place within that much (`openingDiffers` with a slack), so the opening stays
    rooms text. Anything more is left as before, and the rounds still check every opening, so
    nothing is given unchecked.
- `packages/floorplan/src/rooms/compile.ts`, where walls are read and written only (the opening
  line code is not touched):
  - `emit`: a worked-out wall whose ends are one point as the file holds them is left out of the
    plan, the room boundaries and the wall facts. Its id is not given to another wall, so the ids
    of the other walls stay as a plan written before has them. An opening that lands in it is
    refused with its line (`rooms/opening-fit`).
  - `rawPart`: a raw wall whose start and end are one point is refused with its line
    (`rooms/raw`). `rawFacts` measures a raw wall without throwing.
- `packages/cli/src/quantities/compare.ts`, `lengthOf`: a straight wall of no length is 0 long,
  as its comment says, instead of throwing (outside the card's area, one line).
- Words in `messages/en.ts` and `messages/es.ts` (MSG-11). No new message code: the refusals use
  `rooms/raw` and `rooms/opening-fit`.
- No new convention in `types/floorplan.ts`.

## Done

- `packages/floorplan/src/rooms/__tests__/writesBack.test.ts`:
  - a 6 ft door centred on a 6 ft corridor of a row of repeated flats, copied to three floors
    above, reads back with every copy as a door line, no raw line, and writing the text again
    gives back the same walls, rooms and openings;
  - a row of flats whose bedroom wing is wider than its living wing writes with no wall of no
    length, the plan passes its check, and it reads back and writes again;
  - a `raw wall` line with its two ends at one point is refused naming its line, not thrown;
  - a plan holding a wall with no length reads back without it, names it, and the text writes;
  - every lab building and a copied-floor plan read back and write again with no problem.
- `packages/cli` test: writing rooms text with `--replace` over a plan that holds a wall with no
  length writes it and says nothing went wrong inside Grid.
- `npm run typecheck`, `npm run lint`, `npx vitest run packages/floorplan`, `npx vitest run
  packages/cli`, `ownWords.test.ts`, the tolerance test, `npm run scoreboard`.
