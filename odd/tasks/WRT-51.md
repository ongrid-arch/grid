# WRT-51: a door on a side with several walls is refused, or taken onto the room outside its unit

## Outcome

- A door, window or opening line written `in <room> <side>`, where more than one of the room's
  sides faces that way (an L-shaped room, a room with a corner cut out for a bathroom), is no
  longer put silently in the longest of them. It is refused by its line, with each side named by
  the word that picks it (`east.1`, `east.2`, counted from the west or the south, as before), its
  length and what lies beyond it (a room, several, or the outside).
- In a unit placed many times (a deck of cabins, a row of flats), when exactly one of those sides
  looks onto something that is not one of the unit's own rooms (the corridor, the outside), that
  side is taken, and the answer's guesses say so with the word to write to choose another. So a
  cabin door written `in cabin north` goes to the corridor, not into the cabin's own bathroom
  partition.
- A refusal that tells the writer to say a side offers the exact line that writes: the line with
  `in <room> <side>` written in full, tried before it is offered, in the message and as data in
  the problem's `fixes`. This holds for the new refusal and for two rooms that share more than one
  wall (`rooms/two-shared-walls`), whose suggested side could pick the room's outside wall.

## Design

- `packages/floorplan/src/rooms/compile.ts`, opening placement only:
  - `pickEdge` takes the floor's stretches of wall, so it knows what lies beyond each side. With
    several sides facing the word and no `.k`, it takes the one onto the outside of the room's
    unit when the room was placed by a unit and only one side is so; otherwise it stops with
    `rooms/no-side` (the code a raw room's line uses for the same case since WRT-45; no new code).
  - `sideWordOf` gives the word that picks a side, `east` or `east.2`, by the same count as
    `pickEdge`, so an offered line picks the wall it names.
  - Each refusal that names sides records, by its line, the line as it would be written with each
    side (`sideOffers`). The line is offered only when it is written outside a unit: a unit's line
    is written once for every placement, mirrored ones too, so one text cannot be offered for all.
  - `compileRoomsText` tries each offered line, as BRF-6 tries an alignment, and keeps the ones
    with which the line is placed and nothing new is refused; they are appended to the message and
    given as `fixes`.
- The words are in `messages/en.ts` (and the draft `es.ts`), keys `rooms.side.*`; the old English
  guess for sides of equal length goes, since that case is now a refusal.
- `docs/rooms-first.md` says how a side with several walls is read.
- Decisions: a unit's side counts as "outside the unit" when anything beyond it, a room or the
  outside, is not one of that placement's own rooms; with no unit, or two such sides, the line is
  refused rather than guessed. A window follows the same rule.

## Done

- `packages/floorplan/src/rooms/__tests__/sideWalls.test.ts`: an L-shaped room's door written by
  a bare side is refused with both sides, their lengths and what lies beyond, and both full lines
  as fixes that write; each offered line compiles; a cabin unit repeated along a corridor puts
  every door in the corridor wall with a guess; two rooms sharing two walls offer `in <room>
  <side>` lines that write. These fail before the change.
- `npx vitest run packages/floorplan`, `ownWords.test.ts`, `tolerances.test.ts`, typecheck, lint,
  scoreboard.
