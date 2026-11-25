# 2026-11-25: every tool answer matches its output schema (CMD-17)

## For people

- A host that checks Grid's answers against the schema the tool listed no longer refuses
  `grid_check` with a country, or `grid_schedule` for rooms, openings, flats, doors, windows or
  finishes, so an agent keeps using them (CMD-17).

## For agents

- `grid_check`'s output schema no longer requires `withoutPlace`: the answer holds it only when
  no place is stated, as it always did. `grid_schedule`'s output schema is now a list of
  variants (`anyOf`), one for the grouped default and one for each `of` (rooms, openings,
  flats, doors, windows, finishes), each with the rows and totals that variant sends. The answers
  themselves are unchanged. No new code in the record.
