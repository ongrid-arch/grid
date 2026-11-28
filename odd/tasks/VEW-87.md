# VEW-87: a picture's format, size and shape

## Outcome

An agent drawing a view with `grid_view` chooses what comes back, not just what is drawn:

- `format=svg` hands back the viewer's own SVG, each part with its `data-id`, in the answer
  itself (as an embedded resource, `image/svg+xml`), so a page or a program can pick parts out of
  it without writing a file. `png`, the default, is the picture as before. An SVG is made for a
  plan, a facade, a section and a site plan; a 3d or eye picture is pixels, and is refused as svg.
- `width` sets the picture's width in pixels (the drawing is laid out again at that width, its
  labels keeping their size), and `scale` draws the same picture with more pixels per picture
  pixel, sharper and larger, as `grid draw --scale` does. One or the other. No side of the file
  may pass 4096 px (4K).
- `aspect` (1:1, 4:5, 16:9 or 3:2) makes the whole file that shape, its key and caption band
  included: the drawing is framed to fill what is left, so a square crop of a floor for a post is
  one call. A 3d picture is framed for that shape too, and its camera record carries it.

## Design

- `packages/cli/src/mcp/readTools.ts`, `grid_view`: the arguments `format`, `width`, `scale` and
  `aspect`, checked before anything is drawn (svg with 3d or eye, svg with scale, width with
  scale, a size past the limit, a format that disagrees with `out`'s ending, any of them with
  floor=all), and passed to the views. With `format=svg` the answer carries the SVG as a
  resource and no PNG, and says the picture can be looked at with `format=png`.
- `packages/cli/src/draw/views.ts`: one size record (`width`, `aspect`, `scale`) taken by
  `planView`, `facadeView`, `sectionView`, `siteView` and `cameraView`. With an aspect the
  drawing's own height is the file's height less its bands (key and caption): drawn once, and
  again only when a key band turns out to be under it. A scale multiplies the PNG, the boxes,
  the pixels per metre and the pixel transform.
- `packages/viewer/src/picture/sitePlan.ts`: a site plan takes a height, as the other pictures do.
- `packages/cli/src/draw/cameraAsk.ts`: a 3d camera asked with an aspect is fitted at it instead
  of the shape Grid picks.
- The answer's resource travels like a picture: `Answer.resource` in `mcp/toolkit.ts`, passed by
  `serveTools.ts` and written by `protocol.ts` as a `resource` content block. It is not counted in
  the answer's budget, as pictures are not.
- Limits in the tolerances table: the longest side (4096 px), the narrowest width (200 px) and
  the largest scale (4).
- Decisions: `scale` keeps grid draw's meaning (density, not layout); `width` with no aspect
  keeps each picture's own height rule; an eye view takes the aspect as it is, with its lens's
  vertical field, so a square eye view sees less across.

## Done

- `packages/cli/src/mcp/__tests__/viewFormat.test.ts`: svg answer carries a parseable SVG with
  `data-id`s and no PNG; each aspect gives a file of that shape for a plan, a facade, a section,
  a site plan and a 3d view; width and scale give the asked pixels; the refusals.
- `packages/cli/src/mcp`, `packages/cli/src/draw`, `packages/viewer/src/picture`,
  `packages/floorplan/src/geometry/__tests__/tolerances.test.ts`, build, typecheck, lint and the
  scoreboard.
