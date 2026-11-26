# WRT-72: add a door or window to an existing plan

## Outcome
An agent or person can say "put a door here" to a plan that already exists, in one call:
`grid_add_opening` (`grid edit add-opening`). The opening goes in a side of a room, or in the wall
between two rooms, placed as rooms text places it (`from` a side, `distance`, or centred), with a
width, a kind, and for a door the room it opens into or its hand. Nothing exists today that adds
one: only `grid_change_opening` changes or removes an opening that is already there, and
rewriting the rooms text is refused over a plan with phases or hand-patched parts. The call is
refused, nothing written, when the wall is not there, is a dividing line or curved, or has no
free stretch of the width; the same refusals the change makes. In a plan with phases the new
opening is new work.

## Design
- `edit/addOpening.ts`: `addOpening(survey, request)` returns a `Patch` with `addOpenings`.
  The wall is the side of `room` (`wallOnSide`, exported from `edits.ts`) or, with `between`, the
  one wall both rooms lie on. Place and fit use the same code as `changeOpening`: `roomFaceAlong`
  for `from`/`distance`, `freeStretches` for the refusal with the free stretches. Centred in
  the side when no place is given (said as a guess). Defaults are rooms text's: door 0.9 m wide,
  2.1 m high, sill 0; window 1.2 m wide, sill 0.9, height 1.2; opening 0.9 wide.
- A door with `opens_into` gets its swing (and a hinge where its kind needs one) as
  `grid_change_opening` works it out; with `hinged` and `seen_from` the hand is read from rooms.
  A door given neither is drawn with no swing and the answer says so.
- `mcp/editTools.ts`: tool `grid_add_opening`, after `grid_place_item`, a change tool (answer is
  the usual `writeChange` one). `grid edit add-opening` comes from the tool's own arguments.
- Tool count goes 37 → 38 (`tools.test.ts`, `AGENTS.md`).
- Decision: one `between` argument beside `room` rather than a second tool; a wall shared by
  two rooms in more than one piece is refused naming them.

## Done
- `edit/__tests__/addOpening.test.ts`: a door in a room's side centred and from a side; a window
  with its defaults; between two rooms; a width that does not fit is refused with the free
  stretches; refusals (virtual wall, no wall on that side, rooms not touching, taken id);
  a door opening into a room gets its swing; a plan with phases marks it new.
- `tools.test.ts` order and count; `grid edit add-opening` end to end via the tool.
- `ownWords.test.ts`, `tolerances.test.ts`, lint, typecheck of cli, `changes/WRT-72.md`,
  `docs/tool-server.md` and `docs/commands.md` rows.
