# VEW-62: grid_view writes its picture to a file; grid_sheet shows each page

## Outcome

An agent that draws a view with `grid_view` can get the picture as a file in the project: it
passes `out` (a `.png`, `.svg` or `.pdf` name) and the answer gives the path it wrote. Beside the
picture Grid writes a small JSON file, `<name>.view.json`, with the picture's size, its pixels per
metre and, for a plan, the world bounds the picture covers, so a person or a program can place
what is on the picture. Nothing needs copying out of a host's cache or redrawing in another tool.
`grid_sheet` gives a small PNG of each page of a client or check sheet with its answer, so the
agent can look at the sheet before handing it over.

## Design

- `grid_view` takes `out` (text, at most `PATH_MAX`). Left out, nothing is written, as before.
  A bare file name (no folder) goes into `exports/` beside the plan, like every export; a name
  with a folder is written where it says, inside the project. A name that does not end in
  `.png`, `.svg` or `.pdf` is refused naming the three. Every write goes through
  `projectFiles.ts`, so a path outside the project or through a link is refused as everywhere.
- Formats: PNG is the picture the answer already returns. SVG is the viewer's own SVG for a plan,
  a facade and a section (`planView`, `facadeView` and `sectionView` give it when asked). A 3d or
  eye picture is a raster still, so `.svg` is refused for it, saying `.png` or `.pdf` instead. PDF
  is one page, the picture's size in points, holding the PNG (`src/draw/pictureFiles.ts`).
- The JSON beside it: `kind`, `floor`, `file`, `width`, `height`, `pxPerMetre`, and `bounds`
  (`minX`, `minY`, `maxX`, `maxY` in plan metres, y up as the plan states it) for a plan, with
  the rule to turn a plan point into a pixel. `bounds` is null for the other kinds, which have
  no plan frame. Named `.view.json` so a picture called `plan.png` never overwrites `plan.json`.
- The tool's hint changes from `read` to `write-file`, since it can now write; it is then served
  with the other tools that write files.
- `grid_sheet` for a client or check sheet draws each page a second time on a small canvas
  (`previews` option of `sheetPdf`), 600 px wide, and returns them in `images`. The command
  `grid sheet` does not ask for them and pays nothing.
- Decided: `out` is opt-in rather than always writing `exports/view-*.png`, so a look at the plan
  leaves no files behind. Decided: no `.view.json` for PDF or SVG differs from PNG: one JSON for
  any format.

## Done

- `packages/cli/src/mcp/__tests__/viewOut.test.ts`: `out` writes a png, svg and pdf; a bare name
  lands in `exports/`; the JSON's bounds and pixels per metre match the answer; a bad extension,
  a 3d svg and a path out of the project are refused; nothing is written without `out`. Fails
  before the change, passes after.
- `sheetTool.test.ts`: a client sheet answers with one PNG per page.
- `everyPath.e2e.test.ts` has the `grid_view out` slot; `tools.test.ts` holds the tool's hint.
- Type check of `packages/cli`, lint, `ownWords.test.ts` and `tolerances.test.ts` pass.
