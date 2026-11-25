# CMD-31: the comparison by phase judges its issues by what the work does

## Outcome

`grid diff --since phase` (and `grid_diff` with `since: "phase"`) compares a plan before its
work with after it. Its issues now say what the work leaves wrong, not what it meant to do:

- A door whose room the work takes out and replaces with a new room on the same side (a
  knock-through, a room split, a room rebuilt) is not an issue: the new room is the work. A door
  that comes to join a room that stood before the work, or the outside, still is.
- A window that stood between a room and the outside (or floor not drawn) before the work, and
  stands between two rooms after it, is an issue (`window_between_rooms`): an old window that now
  looks into a new room built against it.

Comparing two versions (a marker or git) is as it was.

## Design

- `packages/floorplan/src/geometry/diff/building.ts`: a new option of `compareBuildings`, `work`,
  "the two plans are one plan before and after its own work". With it:
  - each door change from `doorsThatChangedRooms` is kept only when one of its changed sides is
    not a room replaced in the work: a side room the earlier plan has and the later does not,
    taken by a room the later plan has and the earlier does not, is replaced;
  - each window in both plans (by `openingFaces(..., { windows: true })`, the same reading of
    sides the doors use) that had a side that was not a room and now has a room on both sides is
    a `window_between_rooms` issue, ordered after the doors. A window the work adds is placed by
    the work and is not compared, as a door the work adds is not.
- `packages/cli/src/versions/diff.ts`: the comparison by phase passes `work: true`.
- The window's sentence is Grid's own words in `messages/en.ts` (and its draft in `es.ts`).
- Decided: only the comparison by phase is judged this way. Between two versions a room taken
  out and another added is not known to be the work, and the window check there is left for a
  later change. A door that comes to join the outside or a room that stood before the work is
  still an issue: no room was replaced there.

## Done

- `packages/floorplan/src/geometry/__tests__/diff-building.test.ts`: the refurbishment plan by
  phase has no door issue; a classroom block whose two rooms are knocked into one has no door
  issue for the doors into the old rooms, and an old outside window now facing a new classroom
  is the one `window_between_rooms` issue; the same plans compared without `work` keep the door
  issues and have no window issue.
- `packages/cli/src/versions/__tests__/diff.test.ts`: `grid diff --since phase` says the window
  and not the doors.
- Type check of floorplan and cli, lint, the touched tests, `ownWords.test.ts` and
  `tolerances.test.ts`.
