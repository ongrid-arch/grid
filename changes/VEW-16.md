# 2026-11-25: the walls carried down to the stated ground in sections and facades (VEW-16)

## For people

- A house whose ground the site states below its ground floor's slab now stands on that ground in
  every facade and section (VEW-16). Before, the drawings left a white strip between the ground
  line and the slab, the whole width of the house. Now a plinth runs from the ground up to the
  slab: in a facade, a band under the slab along the whole front; in a section, the outside walls
  carried down to the ground, with the ground line running on under the floor. A plan with no
  ground stated, or with the ground at the foot of its slab, is drawn as before.

## For agents

- `planFacade` has a new face kind, `plinth` (`wall: null`): a band along each edge of the lowest
  floor's outline that faces the side, from `ground.level` up to the underside of its base slab,
  when that underside stands more than `plinthLeast` (0.005 m) above the stated ground. It is drawn
  first of the faces at its depth, and the facade's `outline` and `extent.bottom` reach the ground.
- `planSection` has a new part and face kind, `plinth` (its `id` the floor's): the band of the
  floor's outside walls, cut from the ground to the slab's underside, and its faces beyond the cut.
  `ground.segments` now also runs under a floor that stands on a plinth, so the plinths stand on
  it. `plinthUnder` (`@ongrid/floorplan/geometry`'s ground module) is the one rule both read.
- A floor that states `below` other than `ground`, or one off the lowest level, has no plinth.
  The 3D view and the exports are unchanged. No new code in the record.
