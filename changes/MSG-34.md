# 2026-11-27: every tool answers in the plan's language, with one decimal mark (MSG-34)

## For people

- Set the plan's language once (`grid_set_plan language es`) and every tool answers in it: the
  floor areas and the schedules in Spanish, each figure with a decimal comma, and the change
  picture of `grid_diff` with its key and its labels in Spanish too. A tool whose own sentences are
  not translated yet says so in one line, in your language (MSG-34).
- No answer writes some figures with a comma and others with a point any more, and an estimate's
  sums use the plan's decimal mark.
- The CSV tables of the floor areas and the schedules give their lengths in the units the plan is
  read in (feet for a plan in feet and inches), named in each column's head.
- Writing a plan rooms first with the rooms named in Spanish ("Cocina", "Dormitorio") makes Spanish
  the plan's language, unless it has one already.

## For agents

- Every tool takes `language` (a language tag) beside its own arguments, as it takes `whole`; left
  out, the answer is in the plan's `display.language`, else English. A tool with its own
  `language` (`grid_check`, `grid_describe`, `grid_view`, `grid_export`, `grid_sheet`,
  `grid_words`, `grid_set_plan`) keeps its meaning. A word that is no language tag is refused by
  name. `language: "en"` on a plan in another language now answers `grid_check` and `grid_view` in
  English, as asked.
- `grid_areas` and `grid_schedule` (every `of`) answer in the language; their English is word
  for word as before. Figures written with the display's decimal mark throughout: circulation,
  shares and the give or take, which were always written with a point, follow it now; so do
  `grid_takeoff`'s openings off and wall heights, its assumptions and an estimate's money and
  waste. An order's quantity is in the display's units.
- A tool whose own sentences are English yet closes an answer in another language with one line
  in that language (`tool.answer.inEnglish`).
- `grid_check`'s `drawing` data: each message in the check's language.
- `grid_diff`'s picture: its key, the rooms marked removed and changed, and its label in the call's
  language, else the plan's. `grid_compare`'s sheet and `grid_describe`'s walk pictures carry the
  label in the language asked for.
- CSV: `grid_areas` writes `across <unit>` and `up <unit>`, `grid_schedule` `width <unit>`,
  `height <unit>`, `sill <unit>` (and `x`, `y`, `depth` for items) in the display's length unit,
  `ft` for feet and inches; `m` as before for a plan in metres. Cells always use a point.
- `grid_write_rooms` data: `language`, the language the write recorded as the plan's own (the
  call's `language`, or the one the rooms' names are plainly in, only when the plan states none),
  else null; its answer says why in one line.
- New limit `languageNamesLeast` (2 room names) in the tolerances table. No new code in the record.
- Not moved yet: the other tools' sentences; the rooms' uses in lettable lines and the item
  kinds' words are still English in a Spanish answer.
