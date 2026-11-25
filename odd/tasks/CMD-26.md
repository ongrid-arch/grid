# CMD-26: exports that read the same everywhere and write the same twice

## Outcome

- An IFC name holding an emoji or any character beyond the Basic Multilingual Plane is written
  with `\X4\` (the whole code point in eight hex digits), not as two UTF-16 halves inside `\X2\`.
  A reader that follows the encoding decodes the character as typed.
- The IFC project is named from the plan (`name`, else its `title`, else the file's name), and the
  building is named from the plan too: a plan with one named building uses its name, else the
  plan's name, else "Building".
- Every door and window is written with its own `Tag` (its id) and with a property set,
  `Pset_DoorCommon` or `Pset_WindowCommon`, holding `Reference` (its id) and `IsExternal`.
- Two exports of the same plan are the same bytes. The time stamp is the one the caller names:
  `--date <YYYY-MM-DD or ISO time>` on `grid export`, else `SOURCE_DATE_EPOCH` (seconds), else
  the clock as before. Naming either one makes the file reproducible.
- A sketch arc that goes all the way round (360 degrees) is a `CIRCLE` in the DXF, not an `ARC`
  that starts and ends at one angle (which a reader draws as nothing).
- A DXF block for a door or window on a curved wall is named by the width the plan states, not
  by the chord between its edges.

## Design

- `geometry/export/ifc.ts`: `ifcString` walks code points; a run of BMP characters is one `\X2\`
  block, a run beyond it one `\X4\` block (a lone surrogate stays an `\X2\` unit). `buildDocument`
  names the building; `writeOpening` writes `Tag` and the property set (the wall's exposure is
  carried on `WallElement.outside`).
- `export/planExport.ts` names the IFC project `plan.name ?? plan.title ?? file name`.
- `packages/cli/src/command/export.ts` reads `--date` and `SOURCE_DATE_EPOCH` into `now`; a
  value it cannot read is a usage error naming the option.
- `geometry/export/dxf.ts`: a whole-circle sketch arc goes to `Space.circle`; an opening block
  carries the stated width (`opening.width`) for its name, the chord for its drawing, and both are
  in its key so two openings with one chord and two widths do not share a block.
- Decision: `Pset_*Common` carries only what Grid knows (`Reference`, `IsExternal`); no fire
  rating or the like is invented.

## Done

- `ifc.test.ts`: emoji is `\X4\0001F600`, round-trips; project and building names; door and
  window sets and tags; two exports with one date are identical.
- `dxf` tests: a 360-degree sketch arc is a CIRCLE; a curved-wall door's block is named by its
  stated width.
- CLI tests: `--date` and `SOURCE_DATE_EPOCH` give identical bytes on two runs; a bad date is refused.
- floorplan and cli test folders, typecheck, lint, scoreboard, ownWords and tolerances tests.
