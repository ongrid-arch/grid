# VEW-41: a stair or ramp seen beyond the cut is drawn as one profile

## Outcome

In a section, a flight (a stair, or a long ramp laid out as one) that lies beyond the cut is
drawn as its stringer profile and soffit: its two sides, each one outline, and one face where
its treads front the person looking. It is no longer one outlined column per riser, so a run of
64 risers no longer reads as a bar chart.

## Design

- `packages/floorplan/src/geometry/section.ts`, `flightFaces`: the per-riser faces (one riser
  tall each) are replaced by one face per flight, standing at its foot, from the level the flight
  starts at to the level of its last tread, across its width. It is culled as any face is when
  the risers face away. The two sides (their profile, soffit included) and the top end are kept.
- The viewer only draws what the core gives it, so `packages/viewer/src/picture/section.ts`
  does not change.
- No new code, no new convention.

## Done

- A test in `geometry/__tests__/section.test.ts`: a section looking up a long flight (many
  risers) from its foot has one stair face for the risers, not one per riser, and the faces
  beyond are still farthest first.
- The existing stair section tests, `ownWords` and `tolerances` pass; the scoreboard does not
  get worse.
