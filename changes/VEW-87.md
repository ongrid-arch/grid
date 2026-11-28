# 2026-11-28: a picture's format, size and shape in grid_view (VEW-87)

## For people

- A view can be asked as an SVG, at a width or a scale up to 4K, and in the shape a post or a
  slide needs: square, 4:5, 16:9 or 3:2, the whole file that shape (VEW-87).

## For agents

- `grid_view` takes `format` (`png`, the default, or `svg`: the viewer's SVG with each part's
  `data-id`, as an embedded `image/svg+xml` resource and no picture; not for 3d or eye), `width`
  (200 to 4096 px, laid out again) or `scale` (1 to 4, the same picture with more pixels; boxes,
  `pxPerMetre` and `pixelToMetres` follow it), and `aspect` (`1:1`, `4:5`, `16:9`, `3:2`, the
  whole file's shape; a 3d camera is framed for it and its record's `aspectRatio` is it). No
  side may pass 4096 px. `floor=all` takes none of them. New limits `pictureLongestSide`,
  `pictureNarrowest` and `pictureScaleMost` in the tolerances table. No new code in the record.
