# CNT-51: finishes for many rooms in one call, per wall face and in height bands

## Outcome
An agent sets the finishes of a plan the way a person says them: "tile every floor but the
bathrooms' in oak", "all rooms except the wet rooms are painted plaster", "a tiled splashback
600 high behind the kitchen run", "the bathroom is tiled to 1.2 m all round", "the bedroom's
north wall is a feature wall", "the plant room has no skirting". `grid_set_finishes` does each in
one call, on rooms named by id, picked by use, or all rooms with some left out (by id or use, `wet`
standing for bathrooms, toilets and utility rooms). The take-off and the finishes schedule measure
what was said: a band is its own area (the splashback's 2 m2, not the kitchen's whole wall face),
the wall finish keeps the rest, and a room with no skirting is measured with none. `grid_fields`,
`grid_find` and `grid_count` ask by finish (`floor finish = Oak boards`), and `grid_rename_room`
points at the new tool for anything past one room's four surfaces.

## Design
- Plan format, C24 reopened (no new convention number): a room's or zone's `finishes` MAY also state
  `skirting: false` (no skirting: nothing is measured for it), `faces` (a wall face finished other
  than the room's walls: a wall id and a finish) and `bands` (a finish, a height and where it
  starts, on every face of the room, on one wall's face, or `behind` an item over the length of its
  back; a band behind an item starts at the item's top unless it says). Optional, never defaulted:
  a plan with none reads as before. `roomFinishes` reads `false` as no named skirting.
- `packages/cli/src/quantities/finishes.ts`: each room's wall face is split into its bands, its
  face finishes (less the bands on them) and the rest under its walls finish, every share summing
  to the take-off's wall face. A band is measured on the room's inside faces, length times the
  height it takes under the wall's top, less the part of each opening in the band. Rows list the
  bands; the totals add a band's area to its finish's walls total. Skirting `false` leaves the room
  (or the zone's part) with none.
- `packages/cli/src/quantities/takeoff.ts`: a room that states no skirting is taken off with none,
  less any zone of it that names one; a zone with none takes its part off its room.
- `packages/cli/src/edit/finishes.ts`: `setFinishes(survey, request)`, pure, a `Patch` out: the
  rooms picked, each surface set (`none` on skirting for no skirting, `unset` to take a finish out),
  faces merged by wall, bands replacing the room's bands. Refused: no room picked, a wall that is not
  one of the room's, an item not standing in the room or not against one of its walls, a band no
  height. Receipts and refusals in the message files (`en.ts`, `es.ts`).
- `packages/cli/src/mcp/finishesTool.ts`: the tool, after `grid_set_facts`, through `writeChange`.
  `edit/edits.ts`: a room's finishes in the patch are the whole record (faces and bands kept).
  `edit/rename.ts` keeps the faces, bands and no skirting when it changes one surface.
- `packages/cli/src/quantities/query.ts`: `floor finish`, `wall finish`, `ceiling finish`,
  `skirting finish` (`none` for no skirting) and `band finishes` (the finishes of its faces and
  bands) on rooms.
- Docs: `docs/tool-server.md` and `docs/plan-file.md`, AGENTS.md's tool count.

## Done
- `edit/__tests__/finishes.test.ts`: many rooms, all but wet rooms, a band behind an item measured
  as its back's length times its height less a window in it, a band all round, a face finish, no
  skirting, unset, and each refusal.
- `quantities/__tests__/finishes.test.ts`: the walls shares sum to the wall face; a band's area; no
  skirting in the take-off and the schedule.
- `query` tests: find and count by `floor finish`.
- `mcp/__tests__/tools.test.ts` order and count, `everyPath` slots, `ownWords` counts.
- `npm run build`, `npm run typecheck`, `npm run lint`, vitest on the folders changed, scoreboard.
