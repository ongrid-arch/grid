# VEW-69: a flight's risers seen beyond the cut stand where the risers are

## Outcome

A section through a stair draws the flight as it is built everywhere, not only where the line
cuts it. The cut part already is (VEW-11): treads and risers over a waist, the soffit beneath,
joined to its landings. What lies beyond the cut is drawn the same way: the face that stands for
a flight's risers covers only the risers, each at its own place and height, so

- a section along the walking line no longer draws a line from the floor at the stair's foot up
  to its top, which with the slab's edge over the stairwell closed off a strip of the room under
  the stair as a box;
- a section looking at a flight from an angle shows its risers stepping up and away, not a
  rectangle as tall as the flight standing on the floor at the foot;
- seen straight from the foot the risers still make one face, as before (VEW-41), never one
  column each.

## Design

- `packages/floorplan/src/geometry/section.ts`, `flightFaces`: the one face at the foot, from the
  floor to the last tread, is replaced by the risers themselves: each riser line beyond the cut
  is one riser tall, at the height it rises from, and the risers are joined into one face
  (`joined`). Seen head-on they join into the same single rectangle as before. Seen edge-on,
  when the line runs along the flight, they add nothing: the flight's side, its profile, already
  shows them. The top end and the two sides are kept as they are.
- The face keeps one depth, the nearest riser's, so the faces are still drawn farthest first.
- The viewer only draws what the core gives it: `packages/viewer` does not change.
- No new code, no new convention, no new tolerance.

## Done

- `packages/floorplan/src/geometry/__tests__/section.test.ts`:
  - along the walking line, no face of the stair beyond the cut is a line from the floor at the
    foot up to the flight's top (fails before: the foot face seen edge-on);
  - looking at the flight from an angle, the risers' face is open at the foot higher up than a
    riser and a waist, and its pieces step up (fails before: a full-height rectangle);
  - the VEW-41 test still holds: seen from the foot, one riser face.
- `npm run typecheck`, `npm run lint`, the floorplan and viewer tests, `npm run scoreboard`.
