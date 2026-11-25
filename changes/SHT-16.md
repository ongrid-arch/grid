# 2026-11-25: the date on a sheet can be set (SHT-16)

## For people

- `grid sheet --date 2026-01-31` (or a time) puts that date in the title block and footer, as `grid export --date` does for exports; `SOURCE_DATE_EPOCH` is read when it is left out, else today. The same plan with the same date gives the same file, so sheets can be cached by content (SHT-16).

## For agents

- `grid_sheet` takes `date`: 2026-01-31 or a time such as 2026-01-31T09:00:00Z, else `SOURCE_DATE_EPOCH`, else today. A value it cannot read is refused by name. No new code in the record.
