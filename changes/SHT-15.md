# 2026-11-25: a drawing sheet's file name carries its scale and paper (SHT-15)

## For people

- A drawing at a scale is written as `<name>-drawing-1-100-A3.pdf` (and `.svg`, `.png`), so a
  sheet at another scale or paper no longer replaces it (SHT-15).

## For agents

- `grid_sheet` with `layout: drawing` answers `written`, `svg` and `png` paths that end
  `-drawing-1-<N>-<paper>`, the scale and paper the sheet was made at, chosen or asked for. No
  new code in the record.
