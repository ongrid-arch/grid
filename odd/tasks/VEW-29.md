# VEW-29: draw slab edges only where the wall shows them

## Outcome

- A brick or rendered house no longer gets a band at every floor that reads as a concrete string
  course, in a facade or beyond the cut of a section.
- A floor that states its slab thickness (`slab`, C5) still shows the band, where the person said
  there is one. The cut slab in a section is unchanged.

## Design

- The plan has no field for a frame building, and a new convention is out of this change's
  scope, so the one thing that states a band is the floor's stated slab thickness
  (`slab.thicknessStated` in the envelope).
- `packages/floorplan/src/geometry/facade.ts`: the `slab` face is added only when the thickness is
  stated. Otherwise the floor's wall faces stand down by the slab's thickness over the edge, so the
  facade has no gap. A base slab (on the ground) keeps its wall on it. Plinths are unchanged.
- `packages/floorplan/src/geometry/section.ts`: slab edge faces beyond the cut follow the same
  rule, and the wall faces beyond the cut stand down over an unstated slab. Openings keep their
  levels. The cut parts and the "assumed slab" note are unchanged.
- The viewer draws what the core gives it, so it needs no change.

## Done

- `geometry/__tests__/slabBand.test.ts`: no band and a lowered wall without a stated thickness; a
  band with one; the same in a section; the cut slab stays.
- `facade.test.ts` and the section tests that held the old band are updated.
- Typecheck, lint, the floorplan and viewer tests, the own-words test and the scoreboard.
