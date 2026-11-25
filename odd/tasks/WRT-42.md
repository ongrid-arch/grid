# WRT-42: the read-back names what it gives raw, and one opening no longer takes its floor with it

## Outcome

`grid describe --as rooms` (and `grid_describe` as rooms) reads a floor back as room lines even
when rooms text cannot write one of its openings as it is: that opening alone is given in Grid's
own terms (`raw opening`), and every room, wall and other opening of the floor stays rooms text.
A deck of 300 cabins whose one stair opening runs past its wall reads back as some 1,200 lines of
room, wall and door lines with one raw opening, not as 950 raw lines.

Whatever is still given raw is named in the text, so an agent that reads back, changes and
writes again knows what it is looking at:

- a floor given in Grid's own terms says, in its comment line, what stops rooms text from giving
  it back: the wall or room by id and what would change (`wall 'f1-w-t1-north' stands
  elsewhere`), or the writing's own refusal naming the rooms, without line numbers of a text the
  reader never sees;
- an opening given raw on its own has a comment line just above it naming it and saying why.

`rawFloors[].why` gives the same words, and the opening's reason is in `rawOpenings`' text.

## Design

- `packages/floorplan/src/rooms/read.ts`, `readRoomsText`: when writing the draft again is
  refused, every problem whose line is an opening line of a floor still in rooms text makes that
  opening raw on its own (`openingOfLine`), all in the same round, and the draft is written
  again. Only a refusal that is not about an opening line gives its floor raw, as before.
- The reasons are kept beside the draft (`FloorDraft.why` for openings, the floor's `why` map)
  and written as `#` comment lines by `textOf`. A comment is read by no one but the reader, so
  writing the text again gives back the same plan.
- A refusal's message names lines of the draft text (`line 500:`, `(line 80)`), which the reader
  never sees: those are taken out (`withoutLines`).
- The sentences are in `messages/en.ts` and `es.ts` (`describe.rooms.rawFloor`,
  `describe.rooms.rawOpening…`), so the read-back gains no English sentence of its own.
- The settling loop already gives each round to one kind of change; it now has a clear end when it
  runs out of rounds: any floor whose text was not checked is given raw, so the read-back still
  loses nothing.
- No change to `rooms/compile.ts` (another change is there) or to the plan schema.

Decisions:

- A floor is still given raw whole when a wall or room cannot be written as it is. Giving one
  room raw while its neighbours stay rooms text needs rooms text to leave out a wall it would work
  out, which only `compile.ts` could do; giving a whole building of the floor raw would help few
  plans (nearly every floor that goes raw holds one building). Both are left for later.
- The plan file records no `unit` or `repeat`, so the read-back cannot give them back; that is
  the change that keeps a plan's structure, not this one. Rooms read back one line each, as now.

## Done

- A test in `packages/floorplan/src/rooms/__tests__/rawParts.test.ts`: a row of repeated cabins
  on a corridor with a stair lobby whose opening runs past its wall. Before: the floor is raw,
  every line is `raw`, and nothing names the opening. After: the floor is rooms text, the one
  opening is raw with a comment naming it, and writing the text again gives back the same walls,
  rooms and openings.
- A floor given raw for a wall names the wall in its comment line and in `rawFloors`, with no
  line number of the draft.
- `npx vitest run packages/floorplan`, `npm run typecheck`, `npm run lint`, the ownWords and
  tolerances tests, `npm run scoreboard`.
