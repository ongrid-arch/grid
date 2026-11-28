# 2026-11-27: every word, unit and date on a sheet right (SHT-26)

## For people

- A sheet in Spanish now says every sentence in Spanish: the area rules under each table, the
  schedules' rules, the limits of the checks and the kind of building a finding's figure was read
  for (SHT-26). No sheet names a tool, an argument or a command any more. A sheet in square metres
  prints no square feet (the room schedule's total gives the room count alone), the rounding note
  says lengths "as the plan shows them" when they are not in metres, and the opening schedule's
  rule names the unit its sizes are in. A sheet made from the clock is dated today where you are,
  not the UTC day, so one made just after midnight is no longer dated yesterday.

## For agents

- No new code in the record. `grid_sheet`'s PDF: on a sheet in square metres, the room schedule's
  total detail is `<n> rooms` (was `<n> rooms, <n> sq ft`). The notes under the tables are said
  from `areas.measure.*.measures`, `sheet.rule.rooms`, `sheet.rule.openings`, `sheet.rule.types`,
  `areas.rule.flat` and `schedule.rule.flats` in the sheet's language; the check sheet's limits
  are the record's `limits`. `sheet.access.more`, `report.place.give.sheet` and
  `report.place.request.sheet` name no tool or option. New keys: `sheet.rounding.shown`,
  `sheet.rule.*`, `sheet.lengthUnit.*`, `sheet.area.notKnown`. A sheet with no `date` and no
  `SOURCE_DATE_EPOCH` is dated the machine's local day; a `date` given as a time is dated the day
  it is written with.
