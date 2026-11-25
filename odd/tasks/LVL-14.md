# LVL-14: a floor above the ground with no stair is a finding

## Outcome

A plan that draws a ground floor and a floor above it, with nothing on that upper floor to reach
it by, is no longer answered "No findings". Its check gives a finding, `floor/no-stair`, on the
floor: it stands above the ground, no room on it is used as a stair or a lift, and the plan states
no stair (and no ramp) that reaches it. The line's fix is the rooms-text line that adds one (a room
used as a stair on the ground floor, rising `through` the floor), or a stair stated in the plan's
stairs. The plan's write answer (`grid write`, `grid_write_rooms`) says so at once, in one line,
with that same line to add, so an agent sees it before it runs a check.

The floor's way out is still not checked, as before, and the coverage still says so; but the
`floor/not-checked-no-stairs` line is not listed beside the finding for the same floor, because the
finding already says why. A floor that has a stair room or a stated stair that does not reach the
ground keeps its `floor/not-checked-no-stairs` line as it is.

## Design

- `packages/floorplan/src/geometry/rules/noStair.ts` (new): `floorsWithNoStair(plan)`, pure. For
  every floor above the ground (`groundLevel`'s `aboveGround`), in a plan that has a ground floor
  (`groundFloors` not empty; a flat drawn on its own up in a building has nothing to join), with at
  least one room that is not a void, and with no room used as a `stair` or `lift` on it, no stated
  stair (`stairs`) and no ramp (`ramps`) whose `from` or `to` is the floor: the floor's id and the
  ground floor's id a stair to it would rise from. A ramp counts as a join so a parking deck reached
  by its ramp is not said to have nothing; whether it has a stair for people is not this check's.
- `packages/floorplan/src/geometry/rules/check.ts`: a new finding code `no_stair` under the rule
  `floor-has-exit` (a floor that cannot be reached has no way out; no new rule, so the checks run
  stay the same), on the floor, with `stairFrom` (the ground floor's id) on the finding. The core's
  `no_stairs` notice stays in the report: the route checks really did not follow the floor, and the
  coverage reads it.
- `packages/floorplan/src/geometry/rules/types.ts`: `no_stair` in `FindingCode`; `stairFrom` on
  `RuleFinding`, optional, so the report stays at schema version 1.
- `packages/rules/src/result/inspect.ts`: `no_stair` → `floor/no-stair`, a `finding` line whose
  thing is the floor; the `no_stairs` notice of a floor with this finding is not listed as its own
  line.
- `packages/rules/src/checks/coverage.ts`: `floor-has-exit` counts a floor with this finding as
  looked at, so its one finding is on a floor it looked at.
- `packages/rules/src/result/catalogue.ts`: the code's entry, with `floor` and `below` (ids) for its
  fix line.
- Words: `check.noStair` (the finding's sentence), `check.detail.noStair` (the notes' detail),
  `line.floor/no-stair.*` and `write.noStair` (the write answer's line), in `en.ts` and `es.ts`.
- `packages/floorplan/src/notes/notes.ts`: the note's title and detail for the new code.
- `packages/cli/src/command/write.ts`: one line after the drawing problems, from
  `floorsWithNoStair`, in Grid's own words from the message file (no English literal added).
- Docs: `docs/plan-file.md` (the way-out section's codes) and the fragment `changes/LVL-14.md` with
  the code's row.

Decisions taken alone: the rule is `floor-has-exit`, not a new one (no change to the list of checks
run); a ramp counts as a join; a basement with no stair is left as it was (the card is about floors
above the ground); the fix line uses `<where>` for the stair's place, because Grid does not choose
where a stair goes.

## Done

- `packages/floorplan/src/geometry/__tests__/noStair.test.ts`: the two-floor house with no stair
  gives `no_stair` on the upper floor with `stairFrom`; a stair room on both floors, a stated stair,
  a lift room, a ramp, a lone upper floor, a void-only floor and a one-floor plan give none.
- `packages/rules/src/result/__tests__/noStair.test.ts`: `inspectPlan` gives one `floor/no-stair`
  finding line on the floor, with its fix line, and no `floor/not-checked-no-stairs` line for it;
  the summary no longer says "No findings".
- `packages/cli/src/command/__tests__/writeNoStair.test.ts` (or the write tests): the write answer
  has the line.
- Existing tests updated where they pinned the old not-checked line for such a floor.
- `npm run typecheck`, `npm run lint`, the floorplan, rules and cli test folders, `ownWords.test.ts`,
  `contract.test.ts` and `npm run scoreboard` (no count worse).
