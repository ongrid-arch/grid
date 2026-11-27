# ARE-69: the brief's totals per use, scoped figures and one-line updates

## Outcome

An agent keeping what a person asked for in the brief can say it the way the person said it, and
gets lines that match:

- "About 30,000 m² of offices" is one wish for the offices together (`total_area`, or
  `total_at_least` and `total_at_most`), measured as the sum of their net areas, one line, not a
  line per office.
- A wish may be for the rooms on one floor (`floor`) or of one department, any fact of the
  person's own (`fact`), so a brief can ask per floor or per department.
- When one wish misses many rooms the same way, the misses come as one line naming the rooms and
  the sizes drawn, not a line for each: three hundred bedrooms short by their en-suite read as one
  line. A per-room size asked on many rooms far above any room drawn says that a total is given
  by `total_area`.
- A room may be asked for together with the rooms inside it (`with_inner`): the rooms whose only
  way in is through it, an en-suite or a wardrobe, and its zones, so a student bedroom of 13 m²
  "with its en-suite" is measured with the en-suite.
- A room may be asked for by its `diameter`, the widest circle it holds, so a round courtyard
  wish is met or missed instead of staying open.
- The person's figures are scoped: a door width, corridor width, turning circle, ceiling height
  or step for named rooms (`rooms`), rooms of some uses (`uses`), rooms carrying a fact (`fact`)
  or the doors on a way between rooms (`routes`), so a bed-sized door on the ward route does not
  miss every door in the building.
- Three more figures of the person's own: `efficiency` (lettable over gross internal, at least,
  as `grid_areas` gives it), `homes` (at least, the flats the plan lists or else the homes its
  floors state) and `storeys` (exactly, the floors at or above the ground floor).
- The footprint may be measured inside the outside walls (`measure: inside`) as well as outside.
- One wish is added, removed or changed in one call (`add`, `remove`, `update` on
  `grid_write_brief`), each line naming its place in the brief (`where`), so no agent rewrites
  the brief by hand to add a note.

## Design

- `packages/cli/src/brief/brief.ts`: the new fields read and written (`total_area`,
  `total_at_least`, `total_at_most`, `floor`, `fact`, `with_inner`, `diameter` on a room wish;
  `measure` on the footprint; `uses`, `fact`, `routes` and `rooms` on every room-measured figure;
  the figures `efficiency`, `homes` and `storeys`). Every fault of a wish named at once, as
  MSG-33 does. `changeBrief(brief, change)` adds, removes and updates one wish by its place
  ("rooms[2]", "figures.door_width", "footprint", "open[0]"), the result read again whole.
- `packages/cli/src/brief/lines.ts`: totals, the floor and fact scope, the inner rooms (rooms on
  the floor whose every way leads into the room), the diameter by `measureRoom`'s widest circle,
  the scoped figures (a route's doors from the door graph, `wayGraph`, the way with fewest rooms,
  on one floor), the three figures (from `planAreas`, `lettableFigures`, `planFlats`, the floors'
  levels) and the footprint inside (the box of the floor's rooms, its gross internal area). The
  grouping of misses: the per-room size lines of one wish, four or more missed, become one line.
  Each line carries `where`. New wording goes in the message files (`en.ts`, `es.ts`).
- `packages/cli/src/mcp/briefTool.ts`: schema for the new fields; `add`, `remove`, `update`
  arguments, which change the kept brief without `replace`.
- `docs/brief.md` documents all of it.
- Decisions: totals per use are a room wish's fields, not one `area_by_use` figure, since a figure
  holds one value and a brief names several uses. `storeys` is exact, the other two are at
  least. A route is measured on one floor; a route between floors is said open. No new
  convention in `types/floorplan.ts`.
- Not in this change: flats asked for by count and net area, a roof's shape and heights, a first
  layout that fits a must footprint and places doors, and firm standards scoped by room or fact.

## Done

- `packages/cli/src/brief/__tests__/totals.test.ts`: a total per use met and missed in one line;
  a floor and a fact scope; many identical misses grouped; the en-suite counted with
  `with_inner`; a round room's diameter; door width scoped to a route and to a use, the other
  doors no longer missed; efficiency, homes and storeys; the footprint inside; add, remove and
  update of one wish through `grid_write_brief`.
- Existing brief tests, `ownWords.test.ts`, the message-file tests, typecheck, lint, build.
