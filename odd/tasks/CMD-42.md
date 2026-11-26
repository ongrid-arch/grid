# CMD-42: set any field of a part by id, checked by the plan schema

## Outcome
An agent can make a plain follow-up change ("raise this terrace 0.6 m", "the hall walls are
3.2 m high", "the first floor stands at 3.4 m", "make the column 0.5 m wide") with one call, on
any host, without editing the plan file by hand. `grid_set` sets, or takes out, named fields of
walls, rooms, floors, columns, stairs, ramps, bays and structural grids named by id: a wall's
height or arc, a room's floor offset or height, a floor's elevation or outline, a column's size.
Each value is checked by the plan schema before anything is written, the change goes through the
same path as every other change (the receipt, the drawing checks, `based_on` and the plan's
revision), and the answer says what each field was and is now. A field another tool already sets
is refused with the tool to use, so there is one way to make each change.

## Design
- `packages/cli/src/edit/set.ts`: `setFields(stated, request)`, pure, a `Patch` out. The parts are
  ids, looked up in the plan's lists as the file states them (the reading with every phase);
  `kind` says which list when an id is in more than one. A field must be one the list's schema
  names (read from the schema itself, so a field added to the schema is settable with no change
  here); a misspelt one is refused with the nearest field. `set` gives each field its whole new
  value as JSON; `unset` takes fields out.
- Fields another tool sets are refused, naming it: `properties` and a room's `number`
  (`grid_set_facts`), `phase` (`grid_set_phase`), a room's `name`, `use`, `finishes` and
  `conditioned` (`grid_rename_room`), its `boundary` and `holes` (the room edits), a wall's
  `thickness` (`grid_change_wall`), its `start` and `end` (`grid_move_room_side`), its `wallType`
  (`grid_change_type`); `id` is never changed, and what Grid writes when it reads a plan
  (`placedBy`, `unstated`, `typed`, `face`) is refused too. Doors, windows and openings are left to
  `grid_change_opening`, the site and north to `grid_set_site` and `grid_change_site`: every field
  of theirs already has its tool.
- The check: the plan as stated, with the patch applied, is parsed by `FloorPlanSchema`; an issue
  the plan did not have before is refused naming the part, the field and the schema's words, and
  nothing is written. `writeChange` then refuses a change that would add a problem to the drawing,
  as for every edit.
- The patch: walls and rooms through their own maps (so a wall whose height was filled in from
  its floor is changed as its file states it, `readingAfter`), the other lists through the
  patch's `parts`: `PartList` already holds `columns`, `grids`, `bays`, `stairs`, `ramps` and
  `floors`, so `edit/edits.ts` needs no change.
- `packages/cli/src/mcp/setTool.ts`: the tool, through `writeChange`, registered in `serveTools.ts`
  after `grid_tidy` and before `grid_set_facts` (it changes the building; facts do not). Its
  description says which tool to use for the fields it refuses. `based_on` and the revision come
  from the shared path (`revisions.ts`), with no line of the tool's own.
- Decision: values are given in metres, as the file holds them; no units in text, since a field's
  kind (length or not) is not known from the schema without reading zod's internals further.
- Decision: a field is set whole (`arc`, `roof`, `ceiling` as an object), not by a dotted path, so
  the value written is the value checked.
- The answer's and refusals' words are message keys (`edit.set.*`) in `en.ts` and `es.ts`.

## Done
- `packages/cli/src/mcp/__tests__/setTool.test.ts`: a wall's height and a room's floor offset set
  by id and written; a floor's elevation and outline; a column's width; several parts and fields
  in one call with what each was; `unset`; a value the schema refuses (a negative height, an
  outline of two points) refused with nothing written; an unknown field refused with the nearest;
  a field another tool sets refused naming the tool; an unknown id; an id in two lists without
  `kind`; a value that is already so; `based_on` of an old revision refused; the answer carries
  `planRevision`.
- `tools.test.ts` order and count, `ownWords.test.ts`, the messages tests, `npm run typecheck`,
  `npm run lint`, `npx vitest run packages/cli` and `npm run scoreboard`.
