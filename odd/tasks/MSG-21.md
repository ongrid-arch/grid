# MSG-21: a mirrored plan written rooms first diffs as a mirror

## Outcome

A plan written rooms first (`grid write`), marked, then mirrored with `grid edit mirror` (or
`grid_mirror`), diffs as "The plan is mirrored left to right (east and west swap), and every
room keeps its size." with no issues and "Nothing else changed". Before this change the same
diff listed every opening as joining "a space that is not drawn" and said every room of the
earlier plan "cannot be drawn, so they were not compared": ten false issues, and no comparison
of the rooms.

## Design

- Cause: the comparison lays the earlier plan on the later one mirrored (`turnPlan` in
  `packages/floorplan/src/geometry/diff/turn.ts`). A mirror lists each room's walls the other way
  round, so each boundary's fingerprint in the plan's `written` record (WRT-2,
  `rooms/stamp.ts`) no longer matches, and the drawing check calls every room's boundary edited
  by hand (`room/derived-edited`). The diff then leaves those rooms out as broken, and every
  opening's rooms with them. The mirror edit itself already prints the boundaries again
  (`keptDerived`), so only the comparison's own mirrored copy was stale.
- Fix, in `turn.ts` only: when `turnPlan` mirrors a plan that has a `written` record, each room
  whose fingerprint matched its boundary before the mirror is printed again for its reversed
  boundary. A room whose boundary was already edited by hand keeps its stale fingerprint, so it
  is still found as edited: the mirror hides nothing that was there before.
- Decision: print again room by room rather than through `keptDerived`, which prints every
  changed boundary, because that would make a hand edit in the earlier plan vanish from the
  comparison.
- A turn that is not a mirror keeps each boundary's order, so its record is left as it was.
- No new convention, no new message code, no change to any wording.

## Done

- `packages/floorplan/src/geometry/__tests__/diff-turn.test.ts`: the lab's rooms-text flat,
  stamped as written, and the same flat mirrored compare as mirrored with every room its size,
  no issues and no changes (fails before the fix with ten issues); `turnPlan` of a stamped plan
  passes the drawing check, and a room edited by hand before the mirror is still found edited
  after it.
- `npm run typecheck`, `npm run lint`, `npx vitest run packages/floorplan`, the own-words and
  tolerances tests, and `npm run scoreboard`.
- By hand: `grid write`, `grid mark`, `grid edit mirror --how left-right`, `grid diff` on a
  two-bedroom flat written rooms first says it is mirrored, with no issues.
