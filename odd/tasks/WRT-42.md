# WRT-42: the read-back names what it gives raw, and one opening no longer takes its floor with it

## Outcome

`grid describe --as rooms` (and `grid_describe` as rooms) reads a floor back as room lines even
when rooms text cannot write one of its openings as it is: that opening alone is given in Grid's
own terms (`raw opening`), and every room, wall and other opening of the floor stays rooms text.
And an opening on a room side that a stair or lift in the room's corner splits in two is placed
on the stretch it is in, not on the first stretch of that line. So a deck of 300 cabins round two
stair lobbies reads back as some 1,200 room, wall and door lines and no raw line, not as 950 raw
lines.

Whatever is still given raw is named in the text, so an agent that reads back, changes and
writes again knows what it is looking at:

- a floor given in Grid's own terms says, in its comment line, what stops rooms text from giving
  it back: the wall or room by id and what would change (`wall 'ext-south' stands
  elsewhere`), or the writing's own refusal naming the rooms, without line numbers of a text the
  reader never sees;
- an opening given raw on its own has a comment line just above it naming it and saying why.

`rawFloors[].why` gives the same words.

## Design

- `packages/floorplan/src/rooms/read.ts`, `readRoomsText`: when writing the draft again is
  refused, every problem whose line is an opening line of a floor still in rooms text makes that
  opening raw on its own (`openingOfLine`), all in the same round, and the draft is written
  again. Only a refusal that is not about an opening line gives its floor raw, as before.
- `openingLine`: of the room's sides parallel to the opening's wall, the one nearest the
  opening's middle counts how far the middle lies past the side's ends, so of two sides on one
  line (the lobby's east side, split by a stair in one corner and a lift in the other) the
  opening is written on the one it is in (`east.2`). This was what refused the deck's stair
  opening and sent its floor raw.
- A refusal that is not about an opening line gives raw every floor a refused line is on, in the
  same round, not one floor a round: on a plan of many floors with the same fault on each, the
  old loop ran out of rounds and gave a text that was refused, or changed many parts, when
  written. A writing that fails outright (`compile.ts` throwing on a raw part) ends the rounds
  instead of throwing out of the read-back (`writtenAgain`).
- The reasons are kept beside the draft (`FloorDraft.why` for openings, the floor's `why` map)
  and written as `#` comment lines by `textOf`. A comment is read by no one but the reader, so
  writing the text again gives back the same plan.
- A refusal's message names lines of the draft text (`line 500:`, `(line 80)`), which the reader
  never sees: those are taken out (`withoutLines`).
- The sentences are in `messages/en.ts` and `es.ts` (`describe.rooms.rawFloor`,
  `describe.rooms.rawOpening…`), so the read-back gains no English sentence of its own.
- The settling loop gives each round to one kind of change; the refused openings take a round of
  their own, so it gets two more rounds (eight). When it runs out of rounds without settling, the
  floors its text would change are given raw, so the read-back still loses nothing (not when
  asked for rooms first, which stays rooms first as before).
- No change to `rooms/compile.ts` (another change is there) or to the plan schema.

Decisions:

- A floor is still given raw whole when a wall or room cannot be written as it is. Giving one
  room raw while its neighbours stay rooms text needs rooms text to leave out a wall it would work
  out, which only `compile.ts` could do; giving a whole building of the floor raw would help few
  plans (nearly every floor that goes raw holds one building). Both are left for later.
- The plan file records no `unit` or `repeat`, so the read-back cannot give them back; that is
  the change that keeps a plan's structure, not this one. Rooms read back one line each, as now.

## Done

- Tests in `packages/floorplan/src/rooms/__tests__/rawParts.test.ts`:
  - a row of repeated cabins on a corridor beside a stair lobby with a stair and a lift in its
    corners: before, its floor is raw (37 of 42 lines); after, no line is raw, the stair opening
    is written on `east.2`, and writing the text again gives back the same walls, rooms and
    openings;
  - a window drawn across the corner of two rooms: before, its floor is raw; after, only the
    window is a `raw opening`, with a comment line above it naming it and why, with no line
    number, and nothing is lost.
- Over the testers' 291 plans: no read-back that was exact before is less so; the ones that read
  more raw lines after are plans whose read-back before was refused when written or changed
  many parts, and is now written with fewer or no changes.
- A floor given raw for a wall names the wall in its comment line and in `rawFloors`, with no
  line number of the draft.
- `npx vitest run packages/floorplan`, `npm run typecheck`, `npm run lint`, the ownWords and
  tolerances tests, `npm run scoreboard`.
