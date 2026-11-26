# CMD-39: every tool answer kept to a size an agent's host takes

## Outcome

An agent working on a large plan (a 40-floor tower, a 1000-room building) gets answers its host
accepts. Today `grid_check`, `grid_areas`, `grid_describe`, `grid_schedule`, `grid_takeoff` and
`grid_write_rooms` answer 120 to 470 KB on such a plan, mostly structured data, and hosts refuse
them. After this change no answer is more than about 20 KB (its text and its structured data
together) unless the call asks for it whole. A shortened answer says so on its first line after
the label: how large it was whole, what was left out, and how to get the rest (`page`, `whole`,
and `floor` where the tool takes one). Small answers are unchanged, to the byte.

## Design

- One place, `packages/cli/src/mcp/budget.ts`, applied in `serveTools.ts`'s `answer` after the
  label and the shaped figures, so no tool can skip it and no tool needs its own code.
- The budget is `ANSWER_BUDGET_BYTES`, 20,000 bytes of UTF-8: the text plus the structured data
  as JSON. Pictures are not counted: they travel as images.
- Two arguments every tool takes, written once in `toolkit.ts` beside the tool's own:
  `whole` (true: the answer whole, however large) on every tool, and `page` (the text's next
  pieces, each within the budget) on the tools that only read, since calling a tool that changes
  the plan again to read its answer would change the plan again. A tool that already has an
  argument of either name keeps its own.
- Text over its share: runs of four or more lines alike (the same words with other numbers and
  names, such as one line per floor) keep their first two lines and one line saying how many more
  like them were left out. If it is still too long, its head and its last lines are kept (the
  summary leads, and a change's result can come last) and one line in the middle says how many
  lines were left out.
- Structured data over its share: a `text` field that repeats the text gets the shortened text;
  then the largest lists are cut to their first items until the data fits. `left_out` in the data
  records the budget, the whole answer's size and each list cut (`path`, `shown`, `of`). Every
  output schema lists `left_out`, so a strict host still accepts the answer.
- The notes are Grid's words in `messages/en.ts` (`tool.budget.*`) with their draft Spanish.
- Not done here: summaries written by each tool for itself (guesses grouped by rule, arcs as one
  face). The shared cut gives every tool a bounded answer now; a tool's own summary can replace
  the cut for that tool later.

## Done

- `packages/cli/src/mcp/__tests__/answerBudget.test.ts`: on a generated 40-floor tower,
  `grid_write_rooms`, `grid_check`, `grid_areas`, `grid_describe` (both forms), `grid_schedule`
  and `grid_takeoff` answer within the budget, say what was left out, still match their output
  schema; `page=2` gives the next piece; `whole=true` gives the answer as before; a small plan's
  answer is unchanged and carries no `left_out`.
- `tools.test.ts`, `outputSchemas.test.ts`, `ownWords.test.ts`, `tolerances.test.ts`, the cli
  package's tests, lint and the cli type check.
