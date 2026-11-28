# VEW-89: dimension chains on sections

## Outcome

- Every section Grid draws (`grid_view kind=section`, `grid draw --section`, a sheet's section
  page) carries dimension chains, drawn as the plan's dimensions are (extension lines, ticks on a
  paper look, the figure along the line):
  - on its left, past the floor level marks, up to three vertical chains, nearest first:
    the detail (each floor's level, the sill and head of every door and window the line cuts
    and the clear height of the room nearest that side on each floor), floor to floor (each
    floor's level and the top), and the overall height from the ground beside the building to
    its top: the ridge, the parapet or the roof, whichever is highest;
  - under it, two horizontal chains along the cut: the faces of the walls cut on the floor the
    line cuts most walls of, and the overall length of the cut walls.
- Each chain adds up to the next where they share their ends; a chain that would repeat the next
  one is left out, and so is a stretch shorter than the plan's chain sliver.
- `grid_view kind=section` reports the chains in its text (one line a chain, its figures in
  order) and in its data (`section.dimensions`: each chain's kind, and each figure's value, from,
  to and what each end is).
- `dimensions=false` on `grid_view kind=section`, and `--hide dimensions` on
  `grid draw --section`, leave the chains off the picture and out of the answer.

## Design

- `packages/floorplan/src/geometry/section.ts`: the section gives the doors and windows the line
  cuts (`openings`: id, floor, door or window, where across, sill and head levels). The wall loop
  already has each opening and its slice; this only records it. Nothing else changes.
- `packages/floorplan/src/geometry/sectionDimensions.ts` (new): `sectionChains(section)` works
  the chains out of the section alone (levels, roofs, rooms, openings, cut walls, ground). Each
  chain is a list of the plan's own `Dimension` records in section coordinates (x across, y up),
  standing at the building's edge with no offset, each with the names of its two ends. Points
  closer than `chainSliver` are merged, as the plan's chains do: no new tolerance.
- `packages/viewer/src/picture/sectionDimensions.ts` (new): places the chains in pixels (past the
  level marks on the left, under the lowest thing drawn) and draws each figure with the plan's
  own `dimensionMark` and its paints, exported from `scene.ts` for this. The section's frame
  (`frameOf`, `sectionFraming`) widens by the chains' bands, so a sheet that draws sections at
  one scale makes room for them too.
- `packages/viewer/src/picture/section.ts`: `dimensions?: boolean` (on by default) in
  `SectionPictureOptions`.
- `packages/cli`: `sectionView`/`sectionAnswer` pass it on and word the chains; `grid_view`
  takes `dimensions` for a section; `grid draw --section` takes `--hide dimensions` (only).
- English words for the picture's chains, if any, go in `messages/en.ts`; the answer's text is
  the tool's English, as the rest of the section answer is.
- No new convention in `types/floorplan.ts`, no new message code.

## Done

- `packages/floorplan/src/geometry/__tests__/sectionDimensions.test.ts`: a two-storey house with
  a window cut and a pitched roof gives a detail chain with the sill and head, floor to floor
  adding to the top, an overall from the ground to the ridge, the walls chain and the overall
  length; a flat roof with a parapet runs to the parapet; a line that cuts nothing gives none.
- `packages/viewer/src/picture/__tests__/sectionDimensions.test.ts`: the SVG has the chains'
  `dimension` groups on the left and under the drawing, inside the picture, and none with
  `dimensions: false`.
- `packages/cli/src/mcp/__tests__/sectionView.test.ts`: the answer's text and data carry the
  chains, and `dimensions=false` drops them.
- Build, typecheck, lint, the touched test folders, the scoreboard.
