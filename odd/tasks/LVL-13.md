# LVL-13: no assumed roof over a covered floor or an open roof terrace

## Outcome

- A floor whose roof Grid would lay at or below the ground (a crypt or a basement, any part of it
  that the floor above does not cover) gets no assumed roof: the ground covers it. The section,
  the 3D view, the GLB and the IFC draw none over it, and the roof area counts none. The ground is
  the site's stated `ground`, else the ground floor's level, as everywhere else in Grid.
- On a floor with unroofed outdoor space (a roof terrace, a balcony), the walls round that space
  carry no assumed roof where they bound it and no room: a long outside wall shared by a stair
  house and a terrace is roofed along the stair house and open along the terrace. A floor whose
  rooms are all unroofed outdoor space has no roof at all, as before.
- A roof the floor states (LVL-6) is the person's and is left as stated. A wall between a room and
  a terrace still carries the room's roof.

## Design

- `packages/floorplan/src/geometry/envelope.ts`:
  - In `planEnvelope`, after the floors above are cut from the roof, a flat roof Grid assumes
    (no `roof` stated on the floor) whose top (`bottom + thickness`) is no higher than the ground
    is dropped. The ground is `statedGround(plan) ?? 0`, the datum `floorElevations` uses for
    floor levels; a top within `sameFloorLevel` of it counts as at the ground. The floor then
    reads like a covered one: `roof: null`, `roofKnown: true`, no `why`, so no new sentence is
    written and every reader (section, scene, GLB, IFC, facade, take-off) follows.
  - In `outdoorOutlines`, the roof is the building's outline joined to the roofed outdoor spaces,
    as before, less the walls that bound unroofed outdoor space alone: each unroofed outdoor space
    pushed out across the full thickness of the walls it lies on, less each room and roofed
    outdoor space pushed out the same way. A wall a room lists keeps its roof; a parapet stretch
    of a wall shared with a room loses it.
- `packages/floorplan/src/geometry/partyWalls.ts`: `pushedOut` (ARE-14) already pushes a room's
  sides across its walls and fills the corners. It gains a third depth, `'whole'` (the full
  thickness of every wall, whatever its exposure), and an export, `overItsWalls`, the room over
  all of its walls. The smallest change that reuses the one way Grid grows a room into its walls.
- Why the ground and not "wholly covered": a crypt drawn under a choir is covered in intent, but
  the floor above may leave a stretch of it uncovered (thicker walls below, a room above that is
  not worked out). Any part of it that is not covered still lies under the ground, so the ground
  is the reading that holds in every case. A basement larger than the building above (a car park
  under a garden) is read the same way; a slab over it as structure is left for later.
- Decided alone: the rule applies only to the roof Grid assumes, never to one the floor states,
  and needs no new convention, tolerance or message code.

## Done

- `packages/floorplan/src/geometry/__tests__/assumedRoof.test.ts` (new):
  - a roof floor of a stair house and terraces sharing its outside walls: the roof is the stair
    house over its walls only (its area), the section through a terrace cuts no roof there, and
    the 3D scene and the GLB carry the roof only over the stair house;
  - a floor of terraces alone has no roof in the envelope, the section, the scene or the IFC;
  - a crypt larger than the floor above: no roof in the envelope, the section or the IFC (no
    `IFCROOF` named for it); with the site's ground stated below its roof, it has its roof again;
  - a floor that states its roof keeps it.
- The tests fail before the change and pass after it.
- `npm run typecheck`, `npm run lint`, `npx vitest run packages/floorplan packages/viewer`,
  `packages/cli/src/__tests__/ownWords.test.ts`, and `npm run scoreboard` (no count worse).
