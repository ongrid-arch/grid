# ARE-50: check notes that mislead or contradict each other

## Outcome

- A door too narrow to pass gets one note, not two. Today a 0.05 m door is told both "may not
  be meant, it still counts as a way through" (the drawing's question) and "too small for a
  person to get through, not a way through" (the check). The drawing's question steps aside for
  an opening the check already says cannot be passed.
- "No door to the outside" is said only when the floor really has no door to the outside.
  A floor whose only way out is a door that is too narrow to pass, or sits above the ground, is
  told that, and the note for the narrow door is the one that explains it.
- With no place stated the report says "No place is stated, so no figure was applied", and stops
  there. It no longer opens every placeless check by naming US figures.
- A wall is compared with its floor's stated height when the floor states one, and walls lower
  than a door (railings, parapets, balustrades) are left out of what counts as the typical wall.
  Twelve 1.1 m balustrades no longer make ten real 5 m walls look too high.

## Design

- `packages/rules/src/result/inspect.ts`: after the lines are gathered, an
  `opening/size-question` line whose opening also has an `opening/too-small-to-pass` line (alone
  or among a grouped line's `each`) is dropped. One note per opening, said by the check that
  knows more.
- `packages/floorplan/src/geometry/rules/check.ts` and `notes/notes.ts`: the `no_exit` note
  and its detail say a floor has no door to the outside only when no outside door exists on it;
  when doors out exist but none can be used, the detail names why (too narrow, above ground).
- `packages/floorplan/src/messages/en.ts` and `es.ts`: `check.noPlace.none|one|many` become the
  one `check.noPlace`, without the US count. `withoutPlace.usLines` stays in the record as data.
- `packages/floorplan/src/geometry/plausible.ts`: the typical height of a floor's walls leaves
  out walls lower than `wallBalustradeHighest` (new limit, 2.0 m, in `tolerances.ts` and
  `docs/tolerances.md`), and a floor that states its height is the typical height. A new wording
  `issue.wall/size-question.typicalStated` says it against the stated height.
- Decision: the wall-height fix is in `plausible.ts`, outside the notes folders, because that is
  where the note is made. The limit's value (2.0 m) is Grid's own, a little under a door's height.

## Done

- Tests that fail before: one note for a 0.05 m door; a narrow-door-only floor is not "no door
  to the outside"; the placeless sentence has no US figures; five 5 m walls with twelve 1.1 m
  rails and a floor stated 5 m give no wall question; a 20 m wall on a stated 3 m floor still does.
- `npm run typecheck`, `npm run lint`, the floorplan, rules and cli test folders,
  `ownWords.test.ts`, `tolerances.test.ts`, the contract test, `npm run scoreboard`.
