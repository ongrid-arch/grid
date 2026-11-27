# 2026-11-27: faster sheets and pictures, and a sheet's progress page by page (SHT-25)

## For people

- Client and check sheets are made several times faster on a large building (SHT-25): the
  building's envelope, each elevation and each section are worked out once per sheet instead of
  for every drawing that needs them, each page's pictures are drawn once for the PDF and its
  preview, and a row of a long table that fits its line is measured once. A still and a plan
  picture are drawn faster too. The pages, pictures and bytes are the same as before.

## For agents

- No new code in the record. No plan field.
- `grid_sheet` reports how far it has got when the request's `_meta` carries a `progressToken`:
  one `notifications/progress` line per page (`progress` the pages done, `total` the pages,
  `message` "Page n of m", in the sheet's language), sent before the answer. A call without a
  token gets no notification, as before. The answer itself is unchanged.
