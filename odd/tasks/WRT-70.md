# WRT-70: the read-back names a type only on the parts that name one

## Outcome

A plan whose walls, doors or windows take their type from the plan's defaults (`types.defaults`)
can be read back as rooms text (`grid describe --as rooms`) and written again (`grid write`)
without any of those parts gaining a type of its own. The file names a type only on the parts that
named one before, and leaves to the default type what it gives, so a later change of the default
(another type, or the type's own thickness or height) still reaches every part it types.

## Design

- `packages/floorplan/src/rooms/read.ts`: a `raw` line drops the part's type when the reading
  filled it from a default (`typed` lists `wallType`, `doorType` or `windowType`). It keeps the
  values, so the line reads the same with no types to read them from, as before.
- `packages/floorplan/src/rooms/facts.ts` (`carryFacts`, what `grid write` keeps by id): a type the
  plan's part took from a default is not carried as the part's own. A part the text writes with no
  type of its own takes the default type its kind takes, recorded in `typed` with the values the
  type gives the same, so `statedWall` and `statedOpening` leave all of them out of the file.
- Decided: the default is looked up as the reading looks it up (`withTypes`): a wall by its kind,
  `interior` when it states none, never a dividing line; a door or a window by its own default.
- Not changed: a typed plan still reads back raw, since the written-again text names no type and
  the check of the read-back counts that as a difference. That is a separate change.

## Done

- `packages/floorplan/src/rooms/__tests__/defaultTypes.test.ts`: a typed two-bed flat read back and
  written again names no type on the walls and windows typed by default and keeps the spine's own;
  changing the defaults to other types reaches them; a raw line names no default type. Fails before
  the change, passes after.
- The rooms tests, `namedTypes.test.ts` in the CLI, the floorplan type check and lint pass.
