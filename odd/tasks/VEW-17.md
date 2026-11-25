# VEW-17: notes and the label stay off the drawing itself

## Outcome

- A picture's notes never sit over a wall, a dimension or the page edge. A note or tag of the plan
  that carries text is drawn as a small numbered mark at its place and its words are listed,
  numbered, in the band under the drawing (the one that already holds the title and the key).
- "General guidance, not your local rules" is on every picture Grid writes, but in a caption band
  under the drawing, never over it. A plan, a 3D still, a room view and a sheet of plans have the
  drawing untouched and the caption below it.
- The PNG also carries the label in its own metadata (a `Description` text chunk), so the picture
  keeps it when the caption is cropped away, and the answer of a tool that returns a picture still
  carries it as before.
- The diff picture's key and the phased drawing's marks no longer print in the plan's corner
  under the label: the label is gone from there, so nothing is stacked on it.

## Design

- `packages/viewer/src/picture/writing.ts`: `noteNodes` draws a note or tag with text as a numbered
  disc (`data-part="note-mark"`); `noteLines` gives the numbered words; `writingBand` takes them as a
  third argument and writes them under the key, wrapped to the band's width. Symbols (north) and keys
  are unchanged. A note in a room keeps its place under the room's label; the disc sits there.
  Decision: the disc is small (the size of a dimension's text), so it can touch a wall's line only
  where the person put the point there; the sentence itself is never on the plan.
- `packages/viewer/src/picture/planSvg.ts`: `planPicture` passes the notes to the band when notes are
  shown. `pictureToSvg` writes the label as a caption band under the picture (and under the key), and
  `fileHeight(picture, label)` is the file's height with it. No overlay is drawn any more.
- `packages/cli/src/draw/stamp.ts`: `captionCanvas` makes a canvas taller by the caption band, with
  the picture on top untouched and the label under it; `withLabelMetadata` writes the `Description`
  chunk into a PNG. `drawPlan.ts`, `drawStill.ts` and `views.ts` use them, and the heights a view
  reports (`PlanView.height`) include the caption. Pixel boxes stay valid: the caption is only below.
- The comparison picture's key stays at the top-left of the view (it is its own legend, now alone
  there). Its place is `comparison.ts`, left as it is except that it no longer sits under a label.
- Not touched: room label placement (`canvas2d/labelPlacement.ts`) and the section and facade
  drawings themselves; they get the caption band like every picture because it is one shared writer.

## Done

- `packages/viewer/src/picture/__tests__/notes.test.ts` (new): notes have no text on the plan, are
  numbered in the band, and the caption is outside the plan frame; fails before the change.
- Existing picture, draw and still tests updated to the caption band; `label.test.ts` still holds.
- `drawStill` and `sheetView` PNGs are taller than the drawing by the caption and have the label in
  their `Description` chunk (tested).
- `npm run typecheck`, `npm run lint`, the viewer and cli test folders, the own-words and contract
  tests, and `npm run scoreboard` not worse than `scoreboard/current.json`.
