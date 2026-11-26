# WRT-65: "opens in" and "opens out" on a door between two rooms

## Outcome

A door written between two rooms with `opens out` or `opens in` is never written opening one
way in silence. Neither room is the outside, so the words do not say which way it opens, and
the line is refused (`rooms/door-side`), as WRT-55 began. What this change adds:

- The refusal says how the words are most often meant and leads its fixes with that room.
  `opens out` most often means out of the smaller room (a toilet, a store, a plant room opens out
  into the room beside it); `opens in` most often means into the smaller room. Two rooms the
  same size: the one named second, as a door that says nothing opens into the room named
  second. So `door d between sala and aseo, centred, 0.9 wide, opens out` is refused with
  `opens into sala` first and `opens into aseo` second, and the message says why.
- A door between two raw rooms, or between a raw room and a room Grid worked out (WRT-45), is
  refused the same way. Until now it read `opens out` as out of the room named first and wrote
  the door opening into the room named second without a word: the case a person saw, where a
  toilet door meant to open out was written opening into the toilet.

## Design

- `packages/floorplan/src/rooms/compile.ts`: one small helper, `inOutBetween`, works out which
  room the words most likely mean from the two rooms' areas (the room drafts' outlines on the
  rooms path, the plan's room polygons on the raw path) and, when they are the same within
  `areaEqual`, from the order they are named. It sets the line's fixes, likely first, and stops
  with the one message. Both door paths call it.
- Refuse rather than read with a guess: the brief allowed either. A refusal is what WRT-55
  already answers and what its test holds; a guess would turn a refused line into a written door
  for anyone relying on that, and a door the wrong way is a fault a person may not see. The
  likely room leads the fixes, so an agent taking the first fix gets the usual meaning.
- Words: `rooms.door.inOutBetween` in `messages/en.ts` (and the draft in `es.ts`) now names the
  likely room and the reason; two short keys say the reason (the smaller room, or the room named
  second).
- No new code, no new convention, no new tolerance.

## Done

- `rooms/__tests__/refusalsAndEdges.test.ts`: `opens out` between a large and a small room is
  refused with the larger room's fix first and the message naming the smaller room; `opens in`
  leads with the smaller room; two rooms the same size lead by the room named second.
- `rooms/__tests__/rawRoomOpenings.test.ts`: `opens out` and `opens in` on a door between two raw
  rooms are refused with both fixes, where they were written before.
- Type check of `packages/floorplan`, lint, the floorplan tests, `ownWords.test.ts` and
  `tolerances.test.ts`.
