# VEW-67: place a trace image under the plan by a tool, from a picture or a PDF page

## Outcome

An agent tracing a scan, a photo or a drawing sheet never edits `plan.json` by hand, never reads
a scale bar by eye and never digs the schema out of the bundle:

- `grid_place_trace` (and `grid edit trace`) names the picture, the floor it lies under and its
  opacity, and places it: where its top-left corner lies (`at`) and its turn (`rotation`); its
  scale stated (`scale`, metres per pixel) or set from two points on it and the length between
  them (`calibrate_from`, `calibrate_to`, `length`), which is how a scale bar is read: its two
  ends and the length it is marked with; or lined up in one go by pinning two of its pixels to
  the two points of the plan they show (`pin_pixels`, `pin_points`), which sets its corner, turn
  and scale together. `remove` takes the trace image out. The answer says where the picture now
  lies and how a pixel maps to the plan, as `grid_view` does.
- A page of a PDF can be the trace image: `referenceImage.path` may end in `.pdf`, and `page`
  names the page (the first when left out). The page's picture is the largest raster image on it,
  which is what a scanned sheet is; a page drawn only in lines (an export from a CAD program) is
  said to have no picture to draw, never drawn wrong.
- The preview's 2D drawing (`grid_preview_sync`) draws the trace image under the plan, as
  `grid_view` and `grid draw` already do.

## Design

- `packages/floorplan/src/types/floorplan.ts`: C31 gains `page` (a whole number from 1, for a
  PDF) and the `.pdf` ending. No new convention number: the field belongs to C31's record.
- `packages/cli/src/trace/pdfImage.ts` (new): a small reader of a PDF's objects, enough to walk
  its page tree, find a page's image objects (also inside the page's form objects, one level)
  and take the largest. A JPEG stream (`DCTDecode`) is the picture as it is; a deflated stream
  of 8-bit grey or RGB pixels (or 1-bit grey) is written out as a PNG with Node's own zlib. Any
  other kind (CCITT fax, JBIG2, JPEG 2000) is said not to be read yet. Objects are found by
  scanning the file (and its object streams), so a PDF with incremental updates or a compressed
  cross-reference is read without trusting its offsets. No new dependency: rendering vector
  pages would need a PDF renderer, a decision for the owner.
- `packages/cli/src/trace/traceImage.ts`: `.pdf` joins the endings; a PDF is read through
  `pdfImage.ts` and drawn as the PNG or JPEG it gives, with lines for no such page and no picture.
- `packages/cli/src/edit/trace.ts` (new): the change, a patch of the plan's `referenceImage`,
  checked by `ReferenceImageSchema` before anything is written. The pin math: for pixels p1, p2
  and plan points q1, q2, scale = |q2 − q1| / |p2 − p1| (with the pixels' y turned up), the turn
  is the angle between them, and `at` is q1 less the turned, scaled p1. Setting a scale takes the
  calibration out and the other way round, as the schema allows only one.
- `packages/cli/src/mcp/traceTool.ts` (new), registered after the site's tools and before the
  saved views; `grid edit trace` runs it. Its `path` argument joins the every-path test.
  The PDF's page is the tool's `pdf_page` (`--pdf-page`), not `page`: on the tool server `page`
  is the piece of a long answer, and a tool that changes the plan takes none (CMD-39).
- `packages/cli/src/mcp/previewTools.ts` and `src/draw/views.ts`: the sync drawing reads the
  trace image as `grid_view` does and hands it to `planPicture`.
- Rooms text gains no trace line here: the rooms-text compiler is not this change's to edit; a
  later change can add the line on top of `edit/trace.ts`.

## Done

- `packages/cli/src/trace/__tests__/pdfImage.test.ts`: a PDF with a JPEG page, one with a
  deflated RGB page in an object stream, one with only lines, and page numbers past the end.
- `packages/cli/src/edit/__tests__/trace.test.ts`: pinning, calibrating, scaling, turning,
  removing, and refusals.
- `packages/cli/src/mcp/__tests__/traceTool.test.ts`: the tool writes the plan and answers with
  the placement line; `grid_preview_sync`'s SVG holds the trace image.
- Tool count and order tests, the every-path test, `ownWords`, typecheck, lint, the scoreboard.
