# VEW-34: a room under a void is as high as the space over it, in section

## Outcome

- A section through a double-height room (a room under a room on the floor above marked as a
  void) labels the room with its height up to what is over the void: the slab of the floor over
  the void, or its roof. A living room on the ground floor under a void on the first floor reads
  5.65 m when the roof's underside is 5.65 m over its floor, not the 2.70 m of its own storey.
- `grid_section` (and `grid draw --section`) report that height in "Rooms cut, floor to ceiling"
  and in the record's `rooms`, with `through`: the voids the room rises through.
- Voids one over another (a triple-height hall) are risen through one after the other.
- Where the void is over only part of the room on the line (a gallery over the rest), the room is
  labelled where most of it stands: through the void when the void is over most of the room's
  stretch on the line, and its label stands in the tall part; otherwise as before.
- A room that states its own height keeps it (ARE-10).
- The void itself, which has no floor, is no longer labelled with a height of its own over the
  room that rises through it.
- The list under the drawing says the room was drawn up through the void, in its own sentence,
  instead of "drawn up to what is over its storey".

## Design

- `packages/floorplan/src/geometry/section.ts` only, with its words in `messages/en.ts` and
  `messages/es.ts`.
  - From the envelope, for each floor: its slab's body and sunken pieces (what stands over a
    point), its void openings, its roof and its storey's top (`floorLevel + clearHeight`).
  - A point of the cut line rises from a floor: the lowest floor whose slab stands over the
    point, above the room's own floor, is the one over it; when that slab is open there as a void,
    the point rises to that floor's storey top and goes on from that floor; otherwise it stops.
    The floor's own roof, when it covers the point and is lower, stops it first.
  - A room's stretch on the line is split where void openings start and end; each piece is risen
    from its middle. When the pieces under a void are more than half of the stretch, the room's
    height is `top - floorLevel` of the longest of them and its `from`/`to` are that piece; it
    records the void rooms in `through`.
  - Void rooms that a room rises through are left out of `rooms`.
  - The note `room-height` lists rooms whose height is taken from their storey as before; rooms
    risen through a void get their own listed note, kind `room-height` too, with a new sentence
    (`drawing.section.taken.roomVoid.one|many`).
  - Decision: only voids are risen through, not stair or lift openings: a stair room under the
    opening of a stair keeps its storey's height, as before (a smaller change, easy to widen).
  - Decision: the CLI's `roomHeight` (grid_measure) is left as it is: it measures by the walls
    round a room and is another rule (ARE-10); the card is the section.
- No new convention, no new message code.

## Done

- `packages/floorplan/src/geometry/__tests__/voidSection.test.ts`: the two-floor house with the
  landing marked a void: the hall and bedroom under it rise to the first floor's top; the void is
  not listed; the note names them; a room with a stated height keeps it; a partial void decides
  by most of the stretch; stacked voids rise twice. Fails before the change.
- `npx vitest run packages/floorplan packages/viewer packages/cli/src/__tests__/ownWords.test.ts`,
  the tolerances test, `npm run typecheck`, `npm run lint`, `npm run scoreboard`.
