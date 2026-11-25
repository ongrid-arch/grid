# WRT-11: change answers report true areas and counts

## Outcome

After any change to a plan, the answer's figures are the ones `grid_areas` would give for the
plan as it now is, and its counts are of things, not of names.

- A split names the room's real new area and the new room's, and says a room has no window now
  only when none of its walls holds one. On a plan written rooms first it no longer answers
  "13.64 → 0.00 m²" for a room that kept most of its floor.
- One rename is "1 room renamed", not "2 rooms differ". Changes on a building of 46 floors with
  the same room names on each floor say "92 rooms (2 on each of 46 floors)", not "2 rooms".
- The net area before and after is `grid_areas`' net (columns taken off, outdoor spaces and zones
  left out), measured the same way on both sides, so a rewrite that changed nothing is "the same
  building" and never "+42.79 m²".
- A change to which way a door swings says "1 opening changed" and names it, even in a
  building that is the same on both sides of a mirror; "mirrored" is said only by the mirror tool.

## Design

- Cause of "→ 0.00 m²": `splitRoom` read the plan after the patch without `keptDerived`, so on a
  plan written rooms first the stamped boundaries of the two rooms read as changed by hand and
  the rooms had no area. `edit/after.ts` (`planAfter`) is the one place that reads the plan after
  a patch the way the file will be read (`readingAfter` then `keptDerived`); split uses it, and so
  does `writeChange`.
- Room areas in an answer come from `planAreas` (`edit/figures.ts`, `roomNet`), by floor and id,
  never from the survey's own shape area, so columns count the way `grid_areas` counts them.
- `comparePlans` (quantities/compare.ts, outside `edit/`, a small change named in the report)
  takes an option `inPlace`: the second plan is the first one changed, so rooms pair by floor and
  id, no mirror or turn is tried, and the second plan is compared where it stands. The net is
  `planAreas(...).net`. Without the option it is as before, except that the net is also
  `planAreas`' net, so `grid_compare` and `grid_diff` agree with `grid_areas` too.
- The verdict counts rooms changed by kind (renamed, new use, size, added, taken out), and when
  the rooms are on more than one floor says "N rooms (n on each of F floors)" when every floor
  has the same count, else "N rooms on F floors".
- `writeChange` passes `inPlace` unless the patch says it turns the whole plan (`Patch.whole`,
  set by `mirrorPlan` and `turnPlanBy`).
- Decisions: no new message code; no new convention. The renamed count does not look at the
  figure at all when only a name changed.

## Done

- `edit/__tests__/answerFigures.test.ts`: on a plan written rooms first, a split's answer gives
  both rooms' areas that add up to the room's old area less the wall, and keeps the window; one
  rename answers "1 room renamed"; a stretch of a 46-floor building says
  "92 rooms (2 on each of 46 floors)"; the verdict's net equals `grid_areas`' net on a plan with a
  column; a door swing change on a symmetric flat answers "1 opening changed", not mirrored; a
  rewrite of the same plan is the same building.
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run scoreboard` pass; the scoreboard
  does not get worse.
