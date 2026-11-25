# MSG-25: grid_diff between two versions lists a part whose phase changed

## Outcome

A plan with phases (C16: existing, demolished and new) compared with an earlier version of
itself, by `grid diff` and `grid_diff` against a start marker or the last commit, lists every
wall, opening and room whose phase changed between the two versions, with its phase before and
after: a window blocked up since the marker reads `Window "w3" now to be demolished (was
existing), in "Living room"`, a wall kept that was to be demolished reads `Wall "w7" now existing
(was to be demolished), by …`. Such a part is a change line, counts in the verdict, and the
picture of the comparison marks it as changed, so a revision note need not rely on what the agent
remembers. Two versions that differ in no phase read as before, and `since: phase` (the plan
before its work against after it) reads as before.

## Design

- `packages/floorplan/src/geometry/diff/diff.ts` (`diffPlans`): each pair of walls, openings and
  rooms also compares its phase as Grid reads it (`phaseReading` of each version, read only from
  `phases.ts`), as a `phase` property change. The phase is compared only where one of the two
  versions states one on the part: a part that states none on either side takes it from its wall
  or the plan's base, and that is said by the wall's own line, not again by each of its openings.
  An option, `phases: false`, leaves it out.
- `packages/floorplan/src/geometry/diff/summary.ts`: a wall's summary says the phase change in
  words.
- `packages/floorplan/src/geometry/diff/building.ts` (`compareBuildings`): the phase is one of a
  wall's own figures (`WALL_FIGURES`), so a plan written rooms first lists it too; an opening's
  and a room's line say it; the picture's `changed` walls include a wall whose phase changed (an
  opening that changed is already there). `CompareOptions.phases` passes through.
- `packages/floorplan/src/messages/en.ts` and `es.ts`: one sentence, `diff.phase.changed`
  ("now {phase} (was {before})"), with the existing phase words (`issue.part.phase.*`).
- `packages/cli/src/versions/diff.ts` (`diffByPhase`): the plan compared with itself by phase
  passes `phases: false`, because a room kept as it stood (`roomsAsTheyStood`) is paired with the
  room it became, one demolished and one new, and that is the work, not a change of phase.
- No new field in the tool's answer: the change lines (text and entities) carry it, so the
  output schema of `grid_diff` stays as it is. No new message code, no convention.

## Done

- `packages/floorplan/src/geometry/__tests__/diff-phases.test.ts`: two versions of the
  repository's flat (by hand and rooms first), one with a window turned to be demolished, a wall
  turned from demolished to existing, a room made new, and an opening that only follows its wall:
  each is a change line in words, the verdict counts it, the marks hold it as changed, and the
  opening that follows its wall has no line of its own. Two versions with the same phases are the
  same building. Fails before the change (no line at all).
- `packages/cli/src/versions/__tests__/diff.test.ts`: `grid diff --since start` after a window is
  set to be demolished names it; `grid diff --since phase` reads as before.
- Type check, lint, the floorplan and cli test folders, `ownWords.test.ts`, `tolerances.test.ts`,
  the scoreboard.
