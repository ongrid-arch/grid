# 2026-11-26: grid_view writes its picture to a file, and grid_sheet shows each page (VEW-62)

## For people

- A view the agent draws can be saved as a file in the project: a PNG, SVG or PDF, with a small
  `.view.json` beside it giving its size and, for a plan, the part of the plan it covers
  (VEW-62).
- A client or check sheet now comes with a small picture of each page, so the agent looks at it
  before handing it over (VEW-62).

## For agents

- `grid_view` takes `out`, a `.png`, `.svg` or `.pdf` name. A bare name goes into `exports/`
  beside the plan; a name with a folder is written there, inside the project. The answer's data
  gains `written` (the picture's path) and `record` (the `.view.json` beside it: `kind`, `floor`,
  `width`, `height`, `pxPerMetre` and, for a plan, `bounds` in plan metres, y up, with the rule
  from a plan point to a pixel). Both are null or absent when `out` is left out, and nothing is
  written then. `.svg` is not made for `kind` 3d or eye. The tool is now announced as one that
  writes a file (`readOnlyHint` false).
- `grid_sheet` with layout client or check answers with one small PNG per page, in page order, as
  extra images. No new code in the record.
