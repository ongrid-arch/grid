# LVL-22: copy and repeat floors turned, moved or scaled

## Outcome

An agent writing a tower whose floors twist, step or taper writes it in a line or two of rooms
text, instead of working thousands of corner points out by hand or with trigonometry:

- `copy <floor> [with openings] [turn <deg> [clockwise]] [about x,y] [move dx,dy] [scale <s>]`
  takes another floor's rooms turned about a point, moved and scaled. Written on a line of its
  own or at the end of a floor line, as `copy` is today. The turn is in degrees counter-clockwise,
  as `north` reads its degrees, or clockwise with the word after it.
- `repeat floors <n> from <floor> [as <first id>] [with openings] [turn <deg> [clockwise]] [about x,y]
  [move dx,dy] [scale <s>] [rise <m>]` writes `n` floors after `<floor>`, each a copy of it turned,
  moved and scaled once more than the one below and `rise` metres higher:
  `repeat floors 39 from f00 turn 2 rise 3.4` is a 40-storey tower twisting 2° a floor.
- The plan file holds every floor written out, as a copied floor is today: plain rooms, walls and
  openings, with ids that come out the same on every writing (`f01` … `f39`, and the room and
  wall ids a copied floor has now), so a later edit or `grid describe --as rooms` reads them as
  any other floor.
- A turned copy is checked as every floor is: its rooms' areas are the floor's, its walls as many
  and as thick, its doors and windows where the floor it copies has them.

## Design

- `packages/floorplan/src/rooms/floorCopies.ts` (new): the words of a copy line after its floor
  (`readCopyWords`), the `repeat floors` line (`readRepeatFloors`), the ids a repeat writes
  (`repeatedIds`), and the transform: `copyTransform` (the k-th copy's turn, move and scale from
  the line's), `turnedRooms` (each room's inside faces moved), `turnedOpeningWords` and
  `turnedSides` (the side and `from` words of the doors, windows and wall lines, turned with
  their sides).
- `packages/floorplan/src/rooms/compile.ts`: hook lines only. `stCopy` reads the words through
  `readCopyWords` and, for a copy that turns, moves or scales, places the copied rooms through
  `turnedRooms`; the `repeat` statement hands `repeat floors` to a short method that starts each
  floor (its level one up, its height, slab and building the floor's, its elevation `rise` up when
  given) and copies into it. Lines after the repeat are for the last floor it wrote, as after a
  floor line.
- Decisions:
  - The point turned about is `about x,y`, else the middle of the box round the copied floor's
    rooms. Scale is about the same point; the move comes after the turn and the scale. A repeat
    turns its k-th floor k times the turn and scales it by the scale to the power k, always from
    the floor it repeats, so the 40th floor carries no rounding of the 39 before it.
  - Scale keeps the walls as thick as they are: each face of a room moves with its wall's centre
    line (half the gap to the room it faces, else half the inside thickness), so a floor scaled
    by 0.9 has the same 100 mm partitions, its rooms smaller.
  - Doors and windows keep their widths, heights and distances; the side a line names
    (`in a south`, `south.2`) and the end a distance is measured from (`1.2 from west`) are
    turned with the floor, worked out from the room's own sides, so a floor turned 90° keeps its
    doors where they were on the rooms.
  - A room that rises through (`through`) stands where it was written on every floor: a core does
    not twist with the floors round it.
  - A room sized to centre lines or outside faces is copied by its inside faces.
  - The floor's outline (`raw floor {"outline": ...}`) is turned with it. A sloped roof is laid
    along the drawing's sides, so a copy turned other than by quarter turns keeps the roof and
    the answer says so (`rooms/turned-roof`).
  - A repeat writes at most 200 floors.
- `packages/cli/src/mcp/roomsGrammar.ts`: the floors topic and its examples say the new words, so
  `grid_write_rooms` and the grammar an agent asks for teach them. No new tool: rooms text is the
  way floors are written, and `grid_write_rooms` takes it.
- `docs/rooms-first.md`: the two lines in its section on floors.

## Done

- `packages/floorplan/src/rooms/__tests__/turnedFloors.test.ts`: a two-room floor copied turned
  30°, 90° and 180° has the same room areas, the same number of walls of the same thicknesses
  and its doors and windows in the same rooms; a scaled copy keeps its partition thickness; a
  move moves every corner by it; `about` turns about the point; `repeat floors 39 from f00 turn 2
  rise 3.4` writes f01 … f39, each 3.4 m above the one below and turned 2° more, with no problem;
  a core that rises through stays put; the ids are the same on a second writing; a repeat of
  more than 200 and a word it does not know are refused with the form.
- `copyFloor.test.ts` and the rest of `rooms/__tests__` pass as they are.
- `npm run build`, `npm run typecheck`, `npm run lint`, vitest on `packages/floorplan` and
  `packages/cli`, `ownWords.test.ts`, both tolerance tests and `npm run scoreboard`.
