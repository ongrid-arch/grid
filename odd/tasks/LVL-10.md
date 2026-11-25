# LVL-10: a part floor is a set-back, not a floor out of line

## Outcome

A floor that lies wholly inside the floor below it (a mezzanine, a part upper floor, the floor
over a single-storey extension, a ground floor over a larger basement) is no longer said to be
out of line. It is said once, as a part floor set back from the floor below, with the sides it
sits back on and how far on each, the sides it lines up with, and where both stand. A floor set
back on one side only is never said to sit back "all round", and no distance is the width of a
strip measured the wrong way. A floor that reaches past the floor below is still out of line,
and a stretch there is called "all round" only when it goes round the floor.

## Design

- `packages/floorplan/src/geometry/stacking.ts`: after the two cuts (the upper floor past the
  floors below, and they past it), a floor with nothing reaching past and something sitting back
  is a set-back. Each side's distance is how far the stretches that sit back reach past the upper
  floor's own box on that side, from the stretches already kept (each wider than `stackShift`
  and half the thickest wall it runs along), so a wall stub or a sliver names no side. A side no
  stretch reaches past lines up. When no side is set back (a hole inside the floor's outline
  only), the floor is said as before. A stretch is "all round" only when it has a hole, so it
  goes round the floor; a strip on one side that holds the middle of the floor below is named by
  its side and its extent toward it.
- New code `floor/set-back` (a warning, `worth-a-look`), so agents can tell it from
  `floor/out-of-line`: it is still worth a look, because a ground floor drawn wider than the one
  above by mistake (lab E-9) is a set-back too. Its wording keys in `messages/en.ts` and `es.ts`,
  its catalogue entry in `packages/rules/src/result/catalogue.ts`, its row in the fragment.
- `overhang: "meant"` keeps a floor out of both notes, as now.
- Left out, decided: the floor line and `raw floor` of rooms text taking `overhang meant`, and
  rooms text keeping it on a read-back. That is the rooms-text compiler (`rooms/`), which another
  change is working on at the same time; this change does not touch it. The fix still names
  `overhang "meant"`, which the plan file takes.
- Left out, decided: a floor over a mezzanine is still set against the mezzanine only.
- Docs: `docs/plan-file.md` (floors that line up) and `docs/tolerances.md` (`stackShift`'s row).

## Done

- `geometry/__tests__/lineUp.test.ts`: a part floor flush on the south and west, a part floor set
  back on every side, a floor over a rear extension and a part floor in the west 40 % of the
  floor below are each `floor/set-back` with the right sides and distances and never "all round";
  a floor that reaches past stays `floor/out-of-line`; `overhang: "meant"` silences both. They
  fail before the change.
- `packages/rules/src/result/__tests__/language.test.ts`: the set-back's line in English and
  Spanish.
- Type check, lint, the floorplan and rules test folders, `ownWords.test.ts`, `contract.test.ts`
  and the scoreboard.
