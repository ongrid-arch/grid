# ARE-19: a window below the ground is not a way out

## Outcome

When the site states its ground level and a bedroom's only windows (or doors) in outside walls are
ones the below-ground check names, the escape check no longer counts them. The bedroom is reported
as having no window or door to escape through, and the finding says why: its outside openings lie
below the ground. It carries those openings, so the line points at the same openings the
`opening/below-ground` finding is about. An opening with a drawn outdoor space in front of it (a
light well, an area) is still counted: that space is the open air in front of it. A plan that
states no ground is read as before.

## Design

- `packages/rules/src/checks/check.ts`: when the plan states a ground, work out the openings
  `openingsBelowGround` names (the same call the plan check uses, so the two cannot disagree) and
  pass their ids to `escapeCheck`.
- `packages/rules/src/checks/escape.ts`: an opening in that set is left out of the ways out, unless
  the room on its far side is an outdoor space. If a room is left with no way out and some were left
  out for lying below the ground, its `no_escape_opening` finding lists those openings (`openings`)
  and takes the wording `check.noEscapeOpening.belowGround`. A room that keeps a counted window that
  is too small or too high is reported as before, from the windows that count.
- Wording (`messages/en.ts`, `es.ts`, `checks/messages.ts`): the sentence says the room's outside
  openings lie below the ground and that the note on them says by how much; the line's "found" has
  its own variant. The catalogue picks the variant when the finding has openings.
- Decision: the code stays `no_escape_opening` and no field is added: the finding's `openings`
  being non-empty is the whole difference, so no new message code is needed.
- Decision: every opening the below-ground check names counts as left out, wholly or partly below,
  because the check names a foot under the ground and a person cannot climb out onto earth.

## Done

- `rules-escape.test.ts`: a bedroom whose only window is below the stated ground has
  `no_escape_opening` naming that window; with no ground stated it has none; with a drawn outdoor
  space in front it is counted; a door above the ground still counts.
- `ground.test.ts` (result): the line reads the new wording and points at the opening.
- `ownWords`, `contract` tests, typecheck, lint, the rules and floorplan folders, the scoreboard.
