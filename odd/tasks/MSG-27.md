# MSG-27: a comparison pairs walls by place and sees the massing and the site

## Outcome

- A party wall that was lengthened is the existing wall with a new stretch: the comparison pairs
  it with the wall it was, under any id and however the two versions cut it into pieces, says it
  was extended and by how much, and its picture draws the old stretch as unchanged and only the
  new stretch as added. A wall cut back draws only the stretch that went as removed.
- A wall that no longer stands on its line (moved across, turned) is drawn removed where it stood
  and added where it stands, even under the same id: the picture never draws a knocked-through
  wall as unchanged or as merely changed. Its openings still follow it in the words.
- A room that took another in is drawn as one changed room labelled with its sum (the rooms it
  was, the floor the walls taken out stood on, and what it is now); the room it took in is not
  drawn red as lost.
- `grid diff`, `grid_diff` and the comparison read the massing and the site: each floor's
  outline, its homes and parking, the plan's buildings and the site's boundary and things. A
  change to any of them is a change line, so two options with different blocks are never "the
  same building", and the figures are given side by side: gross external area, plot coverage, the
  gross external area against the plot (FAR) and each boundary edge's least distance to the
  building. `grid_compare` says the same and no longer calls such options the same building.

## Design

- `packages/floorplan/src/geometry/diff/place.ts`: after the pairing by place, by id and the walls
  drawn in other pieces, the walls still free on both sides are paired along their line: walls
  alike (floor, kind, thickness, height), straight, on one line within `diffSameLine`, sharing a
  stretch longer than `diffPlace`. A group of one earlier wall and one later wall is a pair (its
  id the later one's). A group with several walls on one side is cut as the later version cuts
  it: each later wall takes the stretch of the earlier walls that lies along it, and what the
  earlier walls had beyond every later wall is kept under a free name, so it reads as removed.
  Openings move onto the piece that holds their middle and rooms list the pieces, as `redraw`
  already does. Many to many with gaps is left as it was.
- `building.ts`, the marks: a wall in both versions whose ends moved is read by place. On the
  same line, the stretches it gained and lost are new `marks.stretches` (`added` or `removed`,
  from, to and thickness, in plan metres) and the wall is drawn unchanged unless another of its
  own figures changed. Off its line, it is in `removed.walls` and `added.walls`. A merged-away
  room is no longer in `removed.rooms`; the receiving room's label gives its sum.
- `packages/viewer/src/picture/comparison.ts` (outside the area, one small edit): draws each
  stretch as a band of the wall's thickness in the added or removed colour.
- A new `diff/massing.ts`: floors' outlines (area, where it moved), homes, parking, buildings
  (added, removed, floors), the site's boundary (area) and things (added, removed, moved, by id),
  and the figures side by side from `planAreaFigures` and `siteMeasures`. Its lines join the
  comparison's change lines (first, after the floors) and its figures are `massing` in the
  comparison and in `grid_diff`'s data. Words go through the message files (en and es).
- `packages/cli/src/quantities/compare.ts`: the likeness is never "same" when the massing lines
  differ, and those lines are listed.
- No new tolerance and no new convention: the figures above are the existing `diffSameLine`,
  `diffPlace` and `diffLength`.

## Done

- Tests in `packages/floorplan/src/geometry/diff/__tests__/diff-by-line.test.ts`: a party wall
  lengthened under a new id and cut differently pairs with the old one and marks only the new
  stretch; a wall cut back marks the removed stretch; a wall moved 4 m under its id is marked
  removed and added; a merged room's label gives its sum and the room taken in is not marked
  removed; a plan written rooms first and extended at the back reads the same way.
- Tests in `diff-massing.test.ts`: an outline moved and grown, a tree removed, homes changed and
  a second block are change lines with the figures side by side; the same massing is no change.
- A test in `packages/viewer` that a stretch is drawn.
- `npm run typecheck`, `npm run lint`, the floorplan, viewer and cli test folders,
  `ownWords.test.ts`, `tolerances.test.ts`, the contract test and `npm run scoreboard`.
