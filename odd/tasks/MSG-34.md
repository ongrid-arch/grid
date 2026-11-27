# MSG-34: Answer every tool in the plan's language

## Outcome

Every tool of the tool server takes `language`, and when a call gives none it answers in the
plan's own `display.language` (set by `grid_set_plan`), else in English. A Spanish plan's
`grid_areas` and `grid_schedule` answer in Spanish, every figure written with one decimal mark:
the display's, which is the language's own unless the display states one. No answer writes some
figures with a comma and others with a point. A tool whose own sentences are not in the
language yet says so once, at the end of its answer, in that language, so the agent knows to
retell it; the codes and figures are the same in every language.

`grid_check`'s drawing list (its `drawing` data, the problems of the drawing itself) is in the
language, as its lines already are. The pictures speak it too: the change picture of
`grid_diff` (its key, and the rooms marked removed or changed), the plans side by side of
`grid_compare` and the pictures of `grid_describe`'s walk carry their label and key in the
language. The estimate and the CSV tables honour the units the plan is read in: the orders of
an estimate are in the display's units and its money in its decimal mark; the CSV of
`grid_areas` and of `grid_schedule` gives its lengths in the display's length unit, named in
the column's head. `grid_write_rooms` records the language the person writes in: the call's
`language`, or, when the plan states none, the language the rooms' names are plainly in
(Spanish names such as "Cocina", "Dormitorio" and "Baño"), and its answer says so.

## Design

- `packages/cli/src/mcp/answerLanguage.ts` (new): the server's `language` argument, added
  beside a tool's own arguments the way `whole` and `page` are (`allArgs` in `toolkit.ts`),
  unless the tool has a `language` of its own (`grid_check`, `grid_describe`, `grid_view`,
  `grid_export`, `grid_sheet`, `grid_words`, `grid_set_plan`), which keeps its meaning. The
  call's language is read once in `serveTools.ts`: the tag asked for, its messages loaded, put
  in the call's `ToolContext` (`language`), never in the tool's arguments. `readPlan` records the
  display of the plan the call reads (`context.spoken`), so a tool that says nothing about
  language still answers in the plan's. `toolLanguage(context, plan)` is the one reading for a
  tool: asked, else the plan's, else English; every shipped language's messages are loaded
  before a call runs, so it is synchronous.
- The answer's own frame is in that language: the budget's notes (`budget.ts` takes the
  language from the server, not from the arguments), and, for a language other than English, a
  closing line when the tool said none of its words in it (`tool.answer.inEnglish`, found with
  `listenForKeys`, which already records what a call says in each language).
- `grid_areas` and `grid_schedule` (`readTools.ts`): every line they write is a key of the
  message files (`tool.areas.*`, `tool.schedule.*`), said in the call's language with the
  display's decimal mark; the English is word for word what it was, so every English answer is
  unchanged. Their figures that were written with `toFixed` (circulation, shares, the give or
  take, a roof's pitch) go through the display's mark. The measures' own rules (`MEASURES` in
  `packages/floorplan/src/geometry/areas.ts`) that were English literals become keys
  (`areas.measure.net.*` and the like) said in English there as the others already are, so the
  tool can say them in the language; `docs/areas.md` is unchanged. The rules the quantities
  modules write (the schedules' and fixtures' rules, the lettable lines) stay as they are: they
  are named in the closing note of what is left.
- `grid_check`: its `drawing` data's messages said from each issue's key (`Issue.said`) in the
  call's language.
- The change picture: `compareBuildings` gives each changed room's label its sentence by key
  (`withSentence`, not enumerable, so the marks compare as before); the viewer's
  `comparisonPicture` takes `language` and `decimal` and says its key (`drawing.comparison.*`)
  and its labels in them; `comparisonView` and `grid_diff` pass the call's language. A
  `language` given to `grid compare`'s sheet and the walk's stills is passed on the same way.
- Units: `estimateAnswer` writes money with the display's decimal mark and an order's quantity
  in the display's units. The CSV of `grid_areas` and of `grid_schedule` (`csvLengths` in
  `quantities/units.ts`) writes lengths in the display's length unit (decimal feet for feet and
  inches) with the unit in the head; areas keep both m2 and sq ft as before. CSV numbers always
  use a point: a CSV cell is data, and a comma would split it.
- `grid_write_rooms`: after the plan is written, its `display.language` is set when the call
  asks a language, or, when the plan states none, to the language the rooms' names are plainly
  in (`languageOfNames` in `packages/floorplan/src/messages/uses.ts`: two or more names that are
  a use's word in one language other than English, and none in any other). The compiler
  (`compile.ts`) is not touched: the language is set on the file after it is written. Its
  answer says which language was set and why, and its data carries `language`.
- Docs: `docs/languages.md` (the language setting, every tool), `docs/tool-server.md` (the
  argument every tool takes).

## Done

- `answerLanguage.test.ts`: every tool lists `language` once; a Spanish plan's `grid_areas` and
  `grid_schedule` (each `of`) answer in Spanish with no point decimal outside names; the same
  plan with `language: "en"` answers in English with commas nowhere; an English plan's answers
  are as before; a tool not moved closes with the line in Spanish; a word that is no language
  tag is refused by name.
- `grid_check` on a Spanish plan: its drawing list is in Spanish.
- `grid_diff` on a Spanish plan: the change picture's SVG key reads in Spanish.
- The estimate on a plan in feet: orders in feet, money with the display's mark; the CSVs of
  `grid_areas` and `grid_schedule` of=rooms in feet name `ft` in their heads.
- `grid_write_rooms` with Spanish room names sets `display.language` to `es` and says so; with
  English names it sets nothing; a plan that states a language keeps it.
- `npm run build`, `npm run typecheck`, `npm run lint`, vitest on the folders changed, the
  tolerances test, the own-words count, the contract test and the tools test.
