# WRT-74: set room numbers and facts through a tool and rooms text

## Outcome
An agent can record what the person says about the parts of a plan without hand-editing JSON or
rewriting the plan. `grid_set_facts` sets facts of the person's own (`department`, `status`,
`zone`, `capacity`) and a room's number on the parts it names by id, or on every part a `where`
picks as `grid_find` picks them ("every room on the first floor is Sales", "lot 7 is sold"), and
takes facts out (`unset`). It answers with what changed on which parts, and what was already so.
Rooms text writes them too, on a room line: `number "2.03"`, `dept "ED"` (the fact `department`)
and `facts department=Sales capacity=4`, and `grid describe --as rooms` writes a room's number and
facts back on its line, so a plan read back and written again keeps them in sight. `grid_fields`
says how facts are set, so the agent finds the tool from the question it asks first.

## Design
- `packages/cli/src/edit/facts.ts`: `setFacts(survey, request)`, pure, a `Patch` out. The parts are
  `parts` (ids of any kind) and the selection (`kind`, `floor`, `room`, `where`) read by
  `quantities/query.ts`'s `select`, both narrowing when both are given. A fact is given by name
  and value (text, a number, yes or no); a name the plan already carries under another spelling
  (`Department` for `department`) keeps the plan's spelling, so a fact has one name across parts.
  A name that is one of Grid's own fields (`area`, `name`, `number`, `use`) is refused, pointing at
  the argument or tool that sets it. `number` gives one room its number, or `none` takes it out; it
  is refused for more than one room, for a zone (its room's number counts), and when another room
  states the same number. When stating one number would move the numbers Grid counts for the
  other rooms, those rooms are given the numbers they showed (WRT-23's rule), and the answer says so.
  `none` that would move the other rooms' numbers is refused: freezing them would leave the room
  a counted number another room may show. `edit/numbers.ts` leaves a room whose stated number the
  change takes out to Grid's count, instead of writing its old number back.
- `edit/edits.ts`: the patch carries a wall's and an opening's `properties` (null takes them out),
  a room's `number` and `properties` as null, and floors as one more `parts` list (`floors`).
- `packages/cli/src/mcp/factsTool.ts`: the tool, a change through `writeChange`, after `grid_tidy`
  and before `grid_save_view` (it changes no part of the building). `readTools.ts` exports the
  `kind`, `where` and `room` arguments grid_find takes, so the two read a selection alike, and
  `grid_fields` names `grid_set_facts` in its answer and description. Tool count 38 → 39.
- Rooms text (`packages/floorplan/src/rooms/compile.ts`, the room line only): `number <text>`,
  `dept <text>` and `facts <name>=<value> ...`. A value in quotes is text; one not in quotes is a
  number when it reads as one, yes or no when it is `yes`, `no`, `true` or `false`, else text. A
  name may be quoted (`"head count"=8`). `words.ts` tells which half of a `name=value` word was in
  quotes. Inside a unit these words are refused: a unit is written once and placed many times, so
  each placed room's number and facts are set with `grid_set_facts` and kept by id.
- `read.ts` writes `number "<n>"` and `facts ...` on the room line. A fact it cannot write so that it
  reads back the same (a name or value ending in a comma, a backslash before a quote) leaves the
  room's facts off its line, and they are kept by id on writing again, as today.
- Decision: one tool for numbers and facts rather than two; the number is the one value a single
  room takes, so it is refused across several rooms instead of numbering them in some order.
- Decision: no `grid edit` verb yet; the command's verbs live outside this change's files.
- The words of the edit's answers and refusals and of the room line's refusals are message keys
  (`edit.facts.*`, `rooms.room.facts*`) in `en.ts` and `es.ts`, so no new English is left to move.

## Done
- `edit/__tests__/facts.test.ts`: set on parts by id across kinds; set through `where`; a name the
  plan spells otherwise keeps the plan's spelling; unset; a number set, taken out, refused for two
  rooms, a zone and a number another room has; the other rooms keep the numbers they showed;
  refusals of an unknown id, Grid's own field names, nothing to change and no parts named.
- `mcp/__tests__/setFacts.test.ts` (`facts.test.ts` there is CNT-9's): the call writes the file and answers what changed; `out`;
  `grid_count` by the fact after it; `grid_fields` names the tool.
- `rooms/__tests__/roomFacts.test.ts` in floorplan: the three words on a room line, typed values,
  quoted names, refusals (empty value, two names for one fact, in a unit, unknown word offers
  them), and `readRoomsText` writes them back so the text writes the same plan again.
- `tools.test.ts` order and count, `server.test.ts`, `everyPath.e2e.test.ts` slot for `out`,
  `ownWords.test.ts` counts, typecheck, lint, the scoreboard, `changes/WRT-74.md`, docs
  (`tool-server.md`, `rooms-first.md`, `plan-file.md`, `commands.md`) and `AGENTS.md`.
