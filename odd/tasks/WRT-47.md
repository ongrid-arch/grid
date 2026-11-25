# WRT-47: the walls line holds for rooms sized to centre lines, and on every floor after it

## Outcome

A `walls outside 0.3 inside 0.1 height 3.4` line is what rooms text writes its walls by, on every
sizing basis and on every floor after it. Today it is not always:

- Rooms sized to the walls' centre lines (or outside faces) and placed by their corner
  (`12 x 10.8 centre at 12,0`) are written with every inside wall 0.3 m thick. Each room takes the
  outside thickness off every side until it knows what wall it ends up with, and rooms placed by
  their corner end up with the gap that guess leaves, so the guess holds. The corner is also the
  inside corner, so rooms written on a 12 m grid stand off it by half a wall.
- A second walls line rewrites the floors written before it: their outside walls and heights take
  the later line's figures, and their inside walls, thinner than the later line says, are reported
  as gaps no line states.
- A floor that states its height gives its walls that height, which is right (LVL-1), but a walls
  line that says another height is then dropped without a word.

When this is done:

- A room sized to centre lines or outside faces and placed by its corner (`at x,y`, or the first
  room with no place, at 0,0) is placed by the corner its size measures to: `12 x 10.8 centre at
  12,0` has its walls' centre lines on x = 12 and x = 24. Where two such rooms meet on that line
  the wall between them is the inside thickness the walls line gives (or the `walls` a room line
  or a `wall between` line gives), and their inside sizes come from it: 12 m to the centre lines
  between an outside wall of 0.3 and an inside wall of 0.1 is 11.80 m inside.
- Each floor writes its walls by the walls line in force when its first room was written. A walls
  line written after a floor's rooms is for the floors after it, and the answer says so
  (`rooms/walls-late`), naming the floor and what it keeps.
- A floor whose stated height is not the walls line's height is said once (`rooms/walls-height`):
  the floor's height is its walls' height, and the walls line's is for floors that state none.

## Design

All in `packages/floorplan/src/rooms/compile.ts`, in the walls-line code and the take-off of
rooms sized to centre lines or outside faces; the other lines (openings, raw lines) are not
touched.

- `FloorDraft.rule`: the walls line a floor is written by. A floor takes the rule in force when it
  starts (its floor line, or its first room for the ground floor nobody named); a walls line
  replaces the current floor's rule while the floor has no rooms, and otherwise is said late and
  kept for the floors after. Every reader of `this.rule` that places rooms or works out a floor's
  walls reads the floor's rule instead. Chosen over a rule per room because a floor's outside
  walls and heights are worked out for the floor as a whole.
- Placing by the corner the size measures to: the take-off of each side is worked out before the
  box, and the box is that corner moved in by the west and south take-offs. A unit's mirrored
  rooms mirror the written box. Rooms placed beside another (`east of`) are placed as before.
- `RoomDraft.drawn`: the box a corner-placed room's size measures to. `sideThicknesses`, which
  says what wall each side ended up with for the next round, gives a side whose drawn edge meets
  another corner-placed room's drawn edge the wall the text means for the two (a `wall between`
  thickness, the rooms' own `walls`, the outside thickness beside outdoor space, else the inside
  thickness), not the gap the round's guess left. The next round places the rooms by it, and the
  gap is that wall. Other sides keep the gap, as before.
- Both new sentences are keys in `messages/en.ts` (and draft Spanish in `es.ts`); both codes are
  rooms-text answer codes like `rooms/wall-from-gap`, documented in `docs/rooms-first.md`, not
  record codes, so the catalogue does not change.
- Decisions to look at: the corner of a room sized to centre lines or outside faces changes from
  its inside corner to the corner of its size. No read-back writes those sizes, so no plan read
  back changes; text written by hand with `centre ... at` moves by half a wall.

## Done

- `packages/floorplan/src/rooms/__tests__/wallsLine.test.ts`, failing before and passing after:
  - two-storey school rooms sized to centre lines on a 12 m grid with `walls outside 0.3 inside
    0.1 height 3.4`: every inside wall 0.1, every outside wall 0.3, centre lines on the grid,
    classrooms 11.80 x 10.50 inside, on both floors; the same sized to outside faces;
  - a floor stating a height other than the walls line's: walls written with none, read at the
    floor's, and `rooms/walls-height` said;
  - a second walls line after the ground floor's rooms: the ground floor keeps the first line's
    thicknesses and height, the first floor takes the second's, no `rooms/wall-from-gap`, and
    `rooms/walls-late` names the ground floor; a walls line written after `floor` and before
    its rooms applies to that floor without a word.
- The existing rooms tests (`packages/floorplan`), the lab's buildings, ownWords and tolerances
  tests, the type check, lint and the scoreboard.
