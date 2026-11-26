# 2026-11-26: the trace image set, placed, scaled and turned by a tool, from a picture or a PDF page (VEW-67)

## For people

- `grid edit trace` sets the trace image under the plan and lines it up: the picture, the floor
  it lies under and how strongly it is drawn; where its corner lies and its turn; and its scale,
  stated, read from a scale bar (its two ends and the length marked on it) or any two points of
  known distance, or set together with its place and turn by pinning two of its pixels to two
  points of the plan. No hand-editing of the plan file (VEW-67).
- A page of a PDF can be traced: a scanned sheet's picture is drawn under the plan, from the
  page the plan names. A page drawn only in lines, as a CAD program exports one, is said not to
  be drawn, with how to trace it (VEW-67).
- The preview's 2D drawing now shows the trace image under the plan too (VEW-67).

## For agents

- New tool `grid_place_trace` (48 tools), after `grid_change_site` and before `grid_save_view`:
  `image`, `pdf_page`, `floor`, `opacity`, `at`, `rotation`, `scale`, `calibrate_from` with
  `calibrate_to` and `length`, `pin_pixels` with `pin_points`, `remove`, `out`. It keeps what a
  call does not give and answers with `referenceImage` as now stated and `trace`, the line
  `grid_view` gives on it.
- `referenceImage` (C31) takes a path ending in `.pdf` and `page` (a whole number from 1). For a
  PDF, the picture's pixels are those of the largest raster image on the page. New lines when one
  is not drawn: no such page, a page with no scanned picture, a picture stored in a kind Grid does
  not read yet (CCITT fax, JBIG2, JPEG 2000, indexed colours), or a file that is no PDF.
- `grid_preview_sync`'s 2D `drawing.svg` holds the trace image (`data-part="trace-image"`).
- The unscaled trace image's line names `grid_place_trace`.
- No new code in the record.
