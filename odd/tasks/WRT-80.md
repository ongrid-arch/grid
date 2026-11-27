# WRT-80: two rooms stacked between two others are written, whatever their sizes measure to

## Outcome

An agent writes a bedroom, a toilet over a store and a living room in a row (or a WC and a
cleaner's store between two offices) and gets the plan, not `rooms/gap`:

- The five lines below are written, the partition between the toilet and the store running across
  the stack from the wall along the bedroom to the wall along the living room, and the plan reads
  back as rooms text and writes again unchanged:

  ```
  walls outside 0.3 inside 0.1
  room a "A" bedroom 3 x 3.1 at 0,0
  room b "B" toilet 1 x 1.5 east of a align north
  room c "C" storage 1 x 1.5 south of b align west
  room d "D" living 3 x 3.1 east of b align north
  ```

- The same holds turned to any side (the stack aligned south, the row running west, north or
  south), placed by coordinates, three rooms high, and two rooms of unequal depth.
- It holds too when the sizes are to the walls' centre lines (`sizes centre`) or outside faces
  (`sizes outside`). Before this change those stacks were refused with a gap "along 0.20 m" or
  "along 0.50 m": the writer's first round takes every side of such a room to be an outside wall,
  so the lower room of the stack was placed short of its neighbours, and that round's refusal was
  final although the next round, with the walls it found, closes the gap.
- A stack truly shorter than the rooms either side is still refused with `rooms/gap`.

## Design

- The inside-size case already writes on main: the stretch of the bedroom's side crossed end on by
  the partition between the two stacked rooms counts as wall when gaps are checked (WRT-10's
  `walled` in `derive`). This change keeps that and holds it to more cases in the tests.
- `packages/floorplan/src/rooms/compile.ts`, `compiled`: a round whose rooms are refused only by
  problems (not stopped by a line) is placed again when the walls it found for rooms sized to centre
  lines or outside faces differ from the ones it took, as a round that writes already is. The
  answer is the last round's, bounded by the existing `SETTLE_ROUNDS`. A text with every size to the
  inside faces finds no such walls, so it is placed once, as before.
- Decision: re-placing the refused round rather than widening the gap check. The gap in the first
  round is real for the rooms as that round placed them (the store ends 0.20 m short of the
  bedroom's corner); calling it a wall would draw a wall the text never meant.
- Tests in `packages/floorplan/src/rooms/__tests__/rooms.test.ts`, beside WRT-10's.

## Done

- New tests in `rooms.test.ts`: the five-line text and its turned, placed and three-high forms are
  written, clean in the drawing's own check and unchanged when read back and written again; the
  stack sized to centre lines and to outside faces is written with a 0.10 m partition and the
  lower room's outside face in line with its neighbours'. The centre and outside cases fail before
  the change.
- `npm run build`, `npm run typecheck`, `npm run lint`, and vitest on
  `packages/floorplan/src/rooms`.
