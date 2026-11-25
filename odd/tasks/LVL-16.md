# LVL-16: copied and through floors keep everything they copy

## Outcome

When an agent writes a tall building rooms first with `copy` and `through`:

- A copied floor takes the floor fields of the floor it copies: its `outline`, `roof`, `parapet`,
  `homes` and `parking`, as `raw floor` holds them. A tower written as one typical floor and forty
  copies counts its homes and parking on every floor, not on the first only. A `raw floor` line
  on the copy sets any of them for that floor alone, and `null` takes one off it
  (`raw floor {"roof": null}`).
- The write warns, with its own code `rooms/copy-no-openings`, when floors copy their rooms but
  none of the doors and windows of the floor they copy, and says to write `copy <floor> with
  openings` or their own. The floors are named in one warning, however many there are.
- A room that rises `through` floors takes with it the doors, windows and openings written
  between two rooms that both rise from the same floor: a stair and its lobby, a lift and its
  landing. A floor that writes its own opening between the same two rooms, or one with the same
  id, keeps its own and not the carried one; `remove <id>` takes a carried one off a floor.
- The floor an id is first written on keeps it as written. Only the later floors that write the
  same id take their floor's id in front (`first-bath`), so copying a floor no longer renames
  the original's rooms and openings, and the facts kept on them by id stay with them.

## Design

- `packages/floorplan/src/rooms/compile.ts`, floor copy and through only:
  - `stCopy` copies the source floor's `RAW_FLOOR_KEYS` fields (deep, as JSON) into the copy's
    own, except those the copy has set already, so a `raw floor` line before or after the copy
    line wins. The level a `raw floor` line may hold is never copied. `emit` leaves out a field
    set to `null`. Decision: `null` is the way to take a copied field off, because a copy line has
    no words of its own for it and `raw floor` already holds these fields.
  - `stCopy` records whether the copy took the openings. After the floors are read, every copy
    that took none and holds no opening of its own (one carried by a rising room does not count)
    while its source has some is named in one `rooms/copy-no-openings` warning. Decision: only
    copies are warned about, not every floor without a door, because the card is about copies and
    a floor of raw parts or a roof floor may rightly have none.
  - `riseInto` carries, with the rising rooms, the opening lines of their floor written
    `between A and B` where A and B both rise from it and every other room the line names rises
    too. They are marked carried. `emit` skips a carried one when the floor writes an opening of
    the same id or between the same two rooms; `stCopy ... with openings` skips one whose id is on
    the floor already. Decision: only `between` openings, never `in <room> <side>`, because a
    stair's door to the street on the ground floor must not climb the tower.
  - The id rule in `emit`: an id written on several floors stays as written on the first floor
    that writes it, and takes the floor's id in front on the others. The `rooms/id-changed`
    warning says which floor kept it.
- `packages/floorplan/src/rooms/read.ts` (outside the card's area, kept small): `localIds` reads
  ids back by the same rule, so a plan written this way reads back to the same text, and a plan
  written before (every floor's id prefixed) is read with its ids as they are, so writing it
  again changes none of them.
- The new sentences are keys in `messages/en.ts` and `es.ts`.

## Done

- Tests in `packages/floorplan/src/rooms/__tests__/copyFloor.test.ts`, failing before: a copy
  keeps the source's outline, roof, parapet, homes and parking, a `raw floor` line overrides and
  `null` drops one; the warning names the copies without openings and not the ones `with
  openings`; a door between two rising rooms is on every floor they rise through, a door to the
  outside is not, a floor's own door between them wins; the source floor keeps its ids; a plan
  written with copies reads back to text that writes the same plan, and an old plan with every id
  prefixed reads back with its ids unchanged.
- `npm run typecheck`, `npm run lint`, `npx vitest run packages/floorplan`, `packages/cli`
  (warnings and ids reach the write), `ownWords.test.ts`, `npm run scoreboard`.
