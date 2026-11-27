# SHT-26: every word, unit and date on a sheet right

## Outcome
A person reading a client or check sheet in Spanish reads every note, rule and limit under its
tables in Spanish: the area rules, the schedules' rules, the limits of the checks and the kind of
building a finding's figure was read for come from the message files in the sheet's language, as
the rest of the sheet already does. No sheet names a tool, an argument or a command
(`grid_measure`, `grid_areas`, `grid_view`, `of=openings`, `--country`, `grid check`): a sheet is
for people. A sheet whose areas are in square metres prints no square feet anywhere, and the
footnotes say the units the figures are in: the rounding note says lengths in millimetres or in
feet and inches as the plan shows them, never "to the centimetre", and the opening schedule's
rule says its sizes are in the plan's length unit, not always in metres. A sheet made from the
clock carries the date where the person is (the machine's own time zone), not the UTC day, so a
sheet made after midnight is dated today.

## Design
All in `packages/cli/src/sheet/` and the message files, the sheet's own area.

- `pages.ts`: the area rules under each table and on the check summary are said from
  `areas.measure.<measure>.measures` in the sheet's language (the English is the same words as
  `MEASURES`, which a test holds). The schedules' rules are said from new `sheet.rule.*` keys:
  the same rules as `grid_schedule`'s, without the tool names, and the openings' with the unit
  its sizes are printed in. The flats' rules already have keys (`schedule.rule.flats`,
  `areas.rule.flat`) and are said from them.
- `pages.ts`: the check sheet asks `checkPlan` in its language and prints the record's `limits`
  (already said in the record's language by `inspectPlan`) instead of the rules report's
  English ones. A finding's "read for" sentence is said from `readForSaid`.
- `pages.ts`: a gross area or an area under air that could not be measured keeps its English
  reason on an English sheet; on another language's sheet it is one keyed sentence naming the
  measure, since the reasons themselves are made in English in the core's area code, outside this
  area.
- Messages: `sheet.access.more` no longer names `grid_measure`; `report.place.give.sheet` and
  `report.place.request.sheet` (used only by the sheet) no longer name `--country` or
  `grid check`.
- Units: on a sheet in square metres the room schedule's total gives the room count alone, never
  square feet beside it (square metres stay beside square feet). The rounding note has a third
  wording for a sheet in square metres whose lengths are not metres (`sheet.rounding.shown`).
- Date: `sheetDay` (new, `sheet/sheetDay.ts`) turns the asked date into the day printed: a date
  as given, a time as written (its own date, at its own offset), `SOURCE_DATE_EPOCH` as the UTC
  day (a reproducible build is the same everywhere), and the clock as the machine's local day.
  `makeSheet` and `makeDrawing` use it; the pages keep printing a UTC day from it.
- Decision: the check sheet is a sheet for people too, so it loses tool names as the client one
  does. `site.country`, a field of the plan, stays in the place note.

## Done
- `__tests__/sheetWords.test.ts`: a Spanish client and check sheet carry no line of English the
  English sheet carries (beyond names and figures), none names a tool, argument or command in
  any language, a metric sheet prints no `sq ft`, the rounding note on a millimetre sheet does
  not say centimetre, the openings' rule on a feet-and-inches sheet does not say metres, and
  `sheetDay` gives the local day from the clock and the written day for a date or a time.
- The sheet folder's tests, the messages' tests, `ownWords.test.ts`, typecheck, lint, build.
