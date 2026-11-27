# CNT-57: rooms grouped into households, departments and zones that every tool reads

## Outcome

A person who groups the rooms of a plan, sixty bedrooms into households of a care home, cells
into wings, a clinic's rooms into departments, the halls of a fair into zones, gets the groups
back from every tool that reads rooms, by the words they would use:

- A room's group is what the plan already holds: the firm's room type (`roomType`), its tenure
  (`tenure`), the flat it is in, or a fact of the person's own (`household`, `department`,
  `zone`, `wing`, any name). No new field and no new convention: CNT-4, CNT-5 and CNT-9 hold them.
- `grid_count by=type` groups rooms by their room type, as `by="room type"` and `by=roomType`
  already do; `tenure` likewise. `type` is read as the room type unless a part carries a fact
  named `type`, which then wins, as a fact always does over a word Grid lends.
- `grid_fields` lists, for the room type, the tenure and the flat type, the values the rooms
  state and how many state each, as it already does for facts, so an agent sees the groups
  before it counts them.
- `grid_view colour=type` and `crop="tenure = private"` read the same fields, as `grid_find`'s
  `where` does.
- `grid_schedule of=rooms` (text, data and CSV) and the sheet's room schedule give each room its
  room type and tenure, on a plan where a room states one; every other schedule is as it was.
- The brief's fact scope (ARE-69, `fact: { name, value }`) reads the room type and the tenure
  as well as facts, so "every room of the tenure private has 12 m²" is measured.
- `grid_count by=area` groups areas at the precision the answer prints them: hundredths of a
  square metre, or whole square feet on a plan read in square feet, and gives the groups and
  sums in the plan's area unit.

## Design

- `packages/cli/src/quantities/roomGroups.ts` (new): the room-group words, the one reading of a
  room's group by a name (`roomGroupValue`): `room type` (also `type`, `roomType`), `tenure`,
  else a fact. `query.ts` and `brief/lines.ts` both read through it.
- `packages/cli/src/quantities/query.ts`: `fieldOf` takes `type` for the room type when no part
  carries a fact so named; `fieldValues` gives a text field's values on rooms for `grid_fields`;
  `printedValue` and `groupParts` take the display, so square feet group as they print.
- `packages/cli/src/mcp/readTools.ts`: `grid_fields` adds `values` to the room-group fields;
  `grid_count` passes the plan's display and writes areas in it; the room schedule's text gives
  room type and tenure.
- `packages/cli/src/quantities/schedule.ts`: `roomType` and `tenure` on a room schedule row, only
  on a plan where a room states one (as `flat`), and their CSV columns.
- `packages/cli/src/sheet/pages.ts`: the sheet's room schedule detail names them.
- `packages/cli/src/brief/lines.ts`: the fact scope reads through `roomGroupValue`.
- Words: the new schedule words are keys in `messages/en.ts` and `es.ts`.
- `compile.ts`, the site measures and `types/floorplan.ts` are not touched.

## Done

- `packages/cli/src/mcp/__tests__/roomGroups.test.ts`: sixty bedrooms in households (a fact),
  with a room type and a tenure: `grid_count by=type`, `by=tenure`, `by=household` each one
  call with the right groups; `grid_fields` lists the room types' values; `grid_view colour=type`
  keys each type; crop by `tenure = private`; the room schedule (text, data, CSV) gives type
  and tenure; a brief wish scoped by tenure is measured on those rooms only; a fact named `type`
  wins over the room type; a square-feet plan counts areas in whole square feet.
- `npm run build`, `typecheck`, `lint`; vitest on the folders changed; the tolerances test and
  `ownWords.test.ts`.
