# LVL-11: a split level is said once, and each floor is set against what lies under it

## Outcome

A floor is set against the floors that lie under its own footprint, in its own building, by
where they stand (their elevation), not against every floor one level lower in the plan. A row of
houses stepping down a street, with `buildings` stated or not, no longer gets notes that set one
house's floor against its neighbour's. A floor that stands a half level up beside another floor of
its building, with nothing under it, is a split level: the plan's split levels are said once, in
one note that names each half level, how far up it stands and on which side of the floor it steps
from, and never as a floor that reaches past or sits back from the floor below. A floor over the
two halves of a split level is set against both. A floor drawn away from the floors below by
mistake, a storey or more up with nothing under it, is still said to be out of line.

## Design

- `packages/floorplan/src/geometry/stacking.ts`, the one place floors are lined up:
  - The floors are taken in groups: each building the plan names (`buildingOfFloor`), and the
    floors no building names together. Each floor's height is its floor level from
    `floorElevations` (its stated `elevation`, else where the stacking rule puts it), so `level`
    stays an order only.
  - The floors under a floor are the lower floors of its group whose outline shares more with
    its own than a strip as wide as a wall they share (`stackShift` and the thickest wall along
    that strip: two halves of a split level overlap by the wall between them, its whole
    thickness). Taken from the nearest down, a floor whose share is all under a nearer one is
    covered by it and is left out, so a floor over a floor over a basement is set against the
    floor only. The floor is set against the floors left, as one outline, with the out-of-line
    and set-back notes as before (LVL-5, LVL-10).
  - A floor with nothing under it, beside a lower floor of its group (their outlines touch or
    overlap) and standing less than that floor's clear height above it, is a half level of it
    (the nearest such floor). One `floor/split-level` warning for the whole plan names each half
    level (the first three, the rest counted), how far up it stands and the side of the floor it
    steps from; it is on the first half level. A half level marked `overhang: "meant"` is left
    out of it.
  - A floor with nothing under it that is no half level, and not the lowest of its group, is set
    against the floors of its group at the nearest level below it, as before, so a floor drawn
    away from the floors below is still out of line.
- Decided: a split level is a warning, the only kind a drawing note can be, but said once for the
  plan, so a terrace of six houses gets one line, not six. It is worth a look because Grid
  decided the reading: a half level drawn at the wrong elevation looks the same.
- Decided: two floors at one level in one group that do not lie under the floor above are no
  longer set against it (a garden studio beside a house, a wing drawn as a floor of its own).
- Decided: heights are equal within `sameFloorLevel`; its row says floors too now. No new
  tolerance and no new convention.
- New code `floor/split-level` (worth-a-look, on the floor): wording keys in `messages/en.ts`
  and `es.ts`, catalogue entry in `packages/rules/src/result/catalogue.ts`, row in the fragment.
- Docs: `docs/plan-file.md` (floors that line up) and `docs/tolerances.md` (`stackShift`,
  `sameFloorLevel`).
- Left out, decided: stair rooms and lift shafts are still lined up floor by floor by level
  (the plan check `stairs-line-up` in `packages/rules`), which is another area.

## Done

- `geometry/__tests__/splitLevel.test.ts`: a row of split-level houses, each its own building and
  with no buildings stated, gives no out-of-line or set-back note and one split-level note; a
  three-level house stepping down a slope gives one split-level note naming both steps and their
  side, never "all round"; a floor over both halves of a split level lines up; a floor over a
  basement is set against the floor between; a floor drawn a storey up beside the one below is
  still out of line; `overhang: "meant"` leaves a half level out. They fail before the change.
- `packages/rules/src/result/__tests__/language.test.ts`: the split level's line in English and
  Spanish.
- `geometry/__tests__/lineUp.test.ts` still passes unchanged.
- Type check, lint, the floorplan and rules test folders, `ownWords.test.ts`, `contract.test.ts`
  and the scoreboard.
