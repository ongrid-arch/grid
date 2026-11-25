# VEW-11: a cut stair drawn with its waist and soffit

## Outcome

A section that cuts a stated stair draws each flight the way a stair is built: its treads and
risers on top, a sloped waist of even thickness under them and the soffit line beneath, joined to
its landings, which are slabs of their own. Nothing under a flight or a landing is filled down to
the floor the stair leaves, so the room under a stair stays open in the section and what lies
beyond it is seen. A flight seen beyond the cut shows the same profile from the side. The
section lists the waist it takes, since the plan states none.

## Design

- `packages/floorplan/src/geometry/section.ts`: the stair is no longer cut from the 3D view's
  blocks (`stairBlocks`, each solid from the foot). For each flight the section works out its
  profile along the flight, `s` from its foot:
  - the top steps up one riser at each riser line, as before;
  - the soffit runs parallel to the pitch line, one waist below the line through the roots of the
    steps (where a tread meets the riser above it), measured square to the slope: the vertical
    drop is `riser + waist / cos(pitch)`;
  - the soffit never runs below what the flight starts from: the floor, or the underside of the
    landing it rises from.
  Where the line cuts the flight, `s` changes linearly along the cut, so the cut is one polygon
  per stretch: the top as a staircase of the riser lines crossed, the bottom as a straight line
  with a kink where it meets the foot. A line square to the flight cuts one tread's slice: a
  rectangle from the soffit to the tread.
- A landing is a slab `max(waist, riser)` thick under its top (at least one riser, so the last
  riser of the flight below meets it), never below the floor the stair starts on.
- Beyond the cut: each flight's two sides are faces with the same profile; its risers, its top end
  and its landings' edges are faces as before, but only as tall as the part really is.
- The waist is a drawing figure of Grid's own, `stairWaist` (0.15 m), in `tolerances.ts` and
  its table in `docs/tolerances.md`. The schema has no field for it, and no convention is added.
- The section lists it as taken (`waist`, not hatched, like the risers Grid works out), with a
  sentence in `messages/en.ts` and `messages/es.ts`.
- The cut stays joined with the walls and slabs it touches, as every cut part is (SE-5); the
  sawtooth and the open soffit are what make it read as a stair.
- Decision: hatching every cut stair (its waist is always taken) would hide the treads, so the
  waist is listed only.

## Done

- `packages/floorplan/src/geometry/__tests__/section.test.ts`: along the walking line the cut
  flight is one shape whose top steps one riser per tread, whose lowest point under the middle of
  the flight stands well above the floor, and whose thickness square to the slope is the waist;
  a landing is a slab, open under it; across the flight the cut is one tread's slice; the waist is
  listed. These fail on the solid blocks.
- The viewer's section test still passes; `npm run typecheck`, `npm run lint`, `npm test`,
  `npm run scoreboard`.
