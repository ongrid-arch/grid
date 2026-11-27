# SHT-25: make pictures and sheets fast

## Outcome
An agent asking for a still of a building of a few hundred walls at 1200 by 800, or a plan
picture of it, has it in well under two seconds once the plan is read. A client or check sheet of
a building of several floors is made in a few seconds, not tens of seconds, and an agent whose host
asks for progress (MCP's `progressToken`) hears how far the sheet has got, page by page, while it
is made. A floor that stands for several alike floors on a client sheet is still printed once
(SHT-21), and no sheet draws any picture twice. Nothing a sheet or a picture shows changes: the
same plan gives the same pages, the same pictures and the same bytes.

## Design
What was measured first, on a block of 585 walls and 420 rooms over three floors (one call of
`grid_sheet` through the tool server, profiled): the check sheet took 11 to 14 s and the client
sheet 5 s, on 2,095 walls over five floors 17 s; a still took 0.6 s and a plan picture 0.3 s
once the plan was read. The time went to five places:

1. The building's envelope (`planEnvelope`: every floor's outline, slabs and roofs) was worked
   out afresh for each of the four elevations, both sections, the choice of the section lines,
   and again when the PDF drew each elevation and section: eight to fourteen times a sheet, half
   of all the time on a large plan.
2. Each elevation and section was worked out twice: once to size it on its page (`sideDrawings`)
   and once to draw it (`pdf.ts`).
3. Wrapping text to the page's width measured every word of every row with the real font, again
   on every page a long table reached; a check sheet of 420 rooms spent 4 s there.
4. The tool server asks for each page's small preview, and every page, pictures and all, was
   drawn a second time for it.
5. The tool read and checked the plan, then `makeSheet` read and checked it again.

So:

- `packages/floorplan/src/geometry/kept.ts`: `keptFor` takes the store it keeps in, and a second
  store, `KEPT_DRAWN`, holds what the drawings of a whole building are made from, so a tower's
  forty floor slices never push the envelope out. Same rule as CMD-51: only for a frozen plan,
  never while the tolerance table is changed for a call, every answer frozen.
- `geometry/envelope.ts`: `planEnvelope` keeps its answer with the frozen plan, keyed by the
  floors asked for and the storey levels given (by value, since `floorElevations` hands out a
  copy each time). `geometry/facade.ts` and `geometry/section.ts`: `planFacade` and
  `planSection` keep theirs, by side and by line.
- `packages/cli/src/sheet/sheetFile.ts`: `makeSheet` and `makeDrawing` take the plan already read
  (the tool server's, kept frozen by CMD-51) and freeze the plan they read themselves, so every
  cache above, and those the geometry keeps already, hold for the whole sheet. Nothing changes a
  plan in place: a sheet only reads it.
- `sheet/pdf.ts`: each picture of a page is drawn once and the same image is placed on the PDF
  page and on its preview. A text that fits its line whole is one line after one measure;
  only a longer one is wrapped word by word, as before (the same lines either way).
- Progress: `sheetPdf` calls `onPage(done, total)` after each page. The tool server's protocol
  (`mcp/protocol.ts`) hands a tool a `progress` callback when the request's `_meta` carries a
  `progressToken`, and sends each report as MCP's `notifications/progress` line before the answer
  (`serve.ts` writes it at once). `grid_sheet` reports "Page n of m". A request without a token
  gets no notification, as before. Only the registration of the tool's behaviour changes; no
  tool is added, so the tool count stays.
- A typical floor: the client sheet already prints alike floors once (SHT-21); the check sheet
  keeps every floor on purpose, its findings naming each floor's own ids. Nothing new here.
- Decisions: the caches live with the frozen plan only, never on a plan that may still change, so
  no edit can be answered from an old figure; the benchmark bound is generous (five times the two
  second target) and the figures are printed, as `pictureTime.test.ts` does, so a busy machine
  does not fail it; no tolerance or limit is added (the cache sizes are counts of answers kept,
  as `KEPT_PER_PLAN` is).

## Done
- `packages/cli/src/sheet/__tests__/sheetSpeed.test.ts` (new): on a block of a few hundred walls
  over three floors, the envelope is worked out once for the whole sheet, and the check sheet with
  previews is made within a generous bound, its time printed; a sheet of the same plan read fresh
  and read frozen gives the same bytes.
- `packages/cli/src/draw/__tests__/pictureSpeed.test.ts` (new): a 1200 by 800 still and a plan
  picture of the same block, each timed and held to a generous bound.
- `packages/floorplan/src/geometry/__tests__/keptDrawings.test.ts` (new): the envelope, a facade
  and a section of a frozen plan are kept (the same object twice), of an unfrozen plan worked out
  afresh, and not kept while the tolerances are changed.
- `packages/cli/src/sheet/__tests__/pdf.test.ts`: wrapping gives the same lines with the fast
  path; `packages/cli/src/mcp/__tests__/progress.test.ts` (new): a `grid_sheet` call with a
  progress token gets one notification per page, in order, before its answer; one without gets none.
- The sheet's, the drawing's, the geometry's and the tool server's tests, typecheck, lint, the
  floorplan purity test, the tolerance test and the scoreboard.
