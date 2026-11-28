# LVL-28: `void` on a room line in rooms text

## Outcome

A plan file can already mark a room as a void (`void: true`, LVL-4): open to the floor below, in
no area, needing no door, its storey's slab open over it and, since LVL-27, no floor drawn over
it in 3D, GLB or OBJ. Rooms text had no word for it, so an agent writing an atrium, a
double-height hall or a pole drop drew a room with a floor, a slab and walls round it. Now:

- `void` on a room line, after the use or in the use slot (`room atrium "Lounge void" void 6 x 8
  at 0,0`), writes the room as a void. Everything LVL-4 and LVL-27 do with a void follows: no
  floor, no area, no door needed, the slab open over it, the room below shown through it.
- A void is open to the rooms it touches on its floor, and to the room it is placed beside or cut
  out of: a dividing line between them, no wall, so a gallery beside it is not walled off and its
  open edge is the void's guard length. A `wall between <void> and <room> railing` line, or one
  with a thickness or a kind, still draws a railing or a wall there. The answer says once that the
  void is open to the room it is placed beside.
- Bad input is refused with the fix: a void on the lowest floor of the plan (nothing under it to
  open to), a void that is also outdoor space, a void with its own floor level (`floor <m>`), and
  a void said to be heated or cooled.
- Reading a plan back writes `void` on the room's line, so the text and the file agree.

## Design

- `packages/floorplan/src/rooms/compile.ts` (owned by this change): `RoomDraft.void`; `readRoom`
  reads `void` in the use slot and as a word after it (in `ROOM_LINE_WORDS`, so a near miss is
  offered); the item takes `void: true` and the room's facts `apart: 'void'`. Touching rooms one
  of which is a void are opened as two outdoor spaces are (WRT-76); a void placed beside a single
  room or inside a room's corner is placed open to it, as `open` would, unless the line gives its
  own wall (`wall <t>`). The lowest-floor check runs on the parsed plan after every floor is
  written, with the floors stacked as every reader stacks them (`floorElevations`).
- `packages/floorplan/src/rooms/read.ts`: `roomLine` writes ` void`.
- `packages/floorplan/src/messages/en.ts` and `es.ts`: the refusals and the note, and `void` in
  the list of room line words.
- `docs/rooms-first.md`: the word, with an example of an atrium over a hall.
- Decisions: no new convention in `types/floorplan.ts` (the void is LVL-4's field); no new
  message code (the refusals are `rooms/syntax`, as other bad room words are); mezzanines or loft
  platforms inside a storey, and balustrade edges in sections, stay out (they need a convention
  the schema does not have).

## Done

- `packages/floorplan/src/rooms/__tests__/void.test.ts`: a `void` room line gives `void: true`
  in both places it can be written; the room is in no inside total; a void touching a gallery
  and one placed beside it are open to it (a virtual wall), and a railing line still draws a
  railing; each refusal; the read-back writes `void` and compiles to the same plan. They fail
  before the change.
- `npm run build`, `npm run typecheck`, `npm run lint`, vitest on `packages/floorplan/src/rooms`,
  `packages/floorplan/src/__tests__`, `packages/cli/src/mcp`, `packages/cli/src/command`, and
  `npm run scoreboard`.
