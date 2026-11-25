# ARE-47: never round a small figure past what changes its verdict

## Outcome
A step of 15 mm reads as 0.015 m in metres, and a sill or tolerance of 25 mm as 0.025 m, as it
already reads 15 mm and 25 mm in millimetres. A figure the person gave (their own step, door
width, corridor width) is written back as they gave it, never rounded.

## Design
- `packages/cli/src/quantities/units.ts`: `lengthText` writes a metric length under 0.1 m that
  two decimals would change to three decimals (trailing zeros kept to two), whatever the unit;
  a figure of 0.1 m or more and a chosen `precision` read as before. `ownLengthText` writes the
  person's own figure exactly (as many decimals as it was given, up to four) in the display unit.
- `packages/cli/src/quantities/access.ts`: its length writer takes a second argument, `own`,
  and the "your figure of …" text and the list of the brief's figures use it.
- `packages/cli/src/mcp/readTools.ts`: the access writer passes `own` on to `ownLengthText`.
- `packages/cli/src/brief/lines.ts`: only the formatter call changes (a small drawn figure is
  written by `smallMetres`, three decimals when two would change it).
- Decision: 0.1 m is the line for "small": every step, sill and tolerance Grid reads is under it
  or is the person's own figure; larger measured figures keep their two decimals.

## Done
- `packages/cli/src/quantities/__tests__/smallFigures.test.ts` fails before and passes after.
- cli test folder, typecheck, lint, ownWords and tolerances tests, scoreboard.
