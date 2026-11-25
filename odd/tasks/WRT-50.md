# WRT-50: a merge takes out every wall two rooms share

## Outcome

Two rooms that share more than one wall (two stretches of one wall run, or two walls, after an
earlier merge or a knock-through) are merged in one call. Every shared stretch is taken out, cut
where the walls round it meet it, with the doors and windows in it, and the merged room is one
outline. With `zones`, each stretch becomes a dividing line of the open-plan room. The answer
names each wall it cut, and says, for each counted fact the two rooms state differently (desks 28
and 40), the value the merged room kept and the one it did not, so an agent can correct it in the
same sitting. Where the merged room would not be one piece (the second room wraps round the
first, or the two touch at two separate places), the call is refused and says why.

## Design

- `packages/cli/src/edit/merge.ts`: `mergeRooms` works out a cut for every shared wall (its
  pieces, its dividing line with `zones`) in place of one. The merged outline is walked: each
  room's wall list gets a marker where it met a shared wall, and the walk follows the first
  room's walls, crosses to the second at a marker and back at the next. A walk that does not
  take in every marker means more than one outline, and is refused. For one shared wall the
  walk gives the order the old code did. Other rooms and openings that name a cut wall follow
  its pieces as before.
- The fact line names the values: "said otherwise of "desks" (28 kept; 40 not kept)".
- `packages/cli/src/mcp/editTools.ts`: the tool text no longer says rooms that share more than one
  wall are refused.
- Decision: no list of rooms in one call. Merging three rooms is two calls (the second room is
  then the merged one), which keeps one tool, one answer.
- No new convention and no new message code.

## Done

- `packages/cli/src/edit/__tests__/mergeShared.test.ts`: two rooms sharing two walls merge in one
  call (boundary, walls, openings, area); with zones both lines are made; a room wrapping round
  another is refused; the answer names the desks values.
- Existing merge tests still pass; typecheck, lint, the cli test folder, scoreboard.
