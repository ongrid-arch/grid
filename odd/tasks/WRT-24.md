# WRT-24: a stretch carries the columns, grids, bays and site things beyond its line

## Outcome

When an agent stretches a plan with `grid_stretch` (or `grid edit stretch`), everything beyond the
line moves out with the walls, not the walls alone:

- columns, parking bays, stairs and ramps wholly beyond the line move by the distance asked;
- a structural grid set square to the stretch moves with it: its lines beyond the line move, and
  the spacing between the last line before it and the first beyond grows (or shrinks) by the
  distance, so the grid still reaches the walls that moved;
- the site's things (fences, gates, paths, paving, pools, trees) move their points beyond the line,
  so one across it gets longer, as a wall does; the plot's boundary stays where it is;
- an opening pattern on a wall that grows keeps its openings where they were, at their pitch: a wall
  that grows at its start takes the distance into the pattern's start margin; a pattern of a count
  alone on a wall that grows at its end keeps that count at its pitch, and the answer says the
  length that is now free; a pattern by spacing says when more openings fit.

The answer names what moved by kind and count, and what stayed behind and why: a stair or ramp
across the line (it would change length), a grid turned across the stretch or drawn on a floor that
was not stretched. Such a grid is said to no longer reach the walls that moved: the stretch's own
check on it.

## Design

- `packages/cli/src/edit/stretch.ts`: works out each part's change from the plan as Grid reads it,
  with the walls' own line and direction. Pure, as before.
- `packages/cli/src/edit/edits.ts` (outside the card's area, kept small): the patch gains one field,
  `parts`, the changed fields of a part by its list and id (`columns`, `grids`, `bays`, `stairs`,
  `ramps`, `patterns`, `site.things`), which `applyPatch` merges into the file's own records. Merging
  fields into the file's records, rather than writing Grid's reading back, keeps everything else
  the file says as it says it (a pattern's opening with no sill stays without one).
- Words: every new sentence is a key in `packages/floorplan/src/messages/en.ts`, with its draft in
  `es.ts`, so the count of English sentences in `stretch.ts` does not grow.
- Decisions:
  - A grid is carried only when every floor it is drawn on is stretched; otherwise it stays and is
    named. A grid neither square nor parallel to the stretch stays and is named.
  - A stair or ramp across the line stays as it was and is named: lengthening it changes its
    risers or slope, which is the person's choice.
  - The plot's boundary is the land, not the building: it never moves, and the answer says so
    when part of it lies beyond the line.
  - The answer's "check" on a grid is in the stretch's answer (`couldNotKeep`), not a new code in
    the record: a new code is outside this card's area.
  - A pattern of one opening alone is left as it is (it sits in the middle of its wall).

## Done

- `packages/cli/src/edit/__tests__/stretchCarries.test.ts`: a small warehouse with columns, a grid,
  bays, a ramp across the line, a stair beyond it, site things and two door patterns, stretched
  east by a bay; the test fails on the code before the change and passes after it: the columns,
  bays and stair move, the grid's last spacing grows, the fence gets longer, the patterns keep
  their door places and pitch, the ramp and a turned grid are named as staying.
- The existing stretch tests (`requests.test.ts`, `answerFigures.test.ts`, `curvedEdits.test.ts`)
  still pass.
- `npm run typecheck`, `npm run lint`, the CLI and floorplan test folders, `ownWords.test.ts`,
  `contract.test.ts` and `npm run scoreboard`.
