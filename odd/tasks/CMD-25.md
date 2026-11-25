# CMD-25: never write picture bytes to a terminal

## Outcome

`grid draw` never puts PNG bytes on a terminal, whichever picture is asked for: `--png`, `--3d`,
`--view`, `--facade ... --png`, `--section ... --png`. With no `--out` and a terminal for output
it refuses, before the plan is read, writes nothing and names `--out`. Sent to a file or a pipe,
the bytes are written as before. An SVG is text and is still printed.

## Design

- `packages/cli/src/command/main.ts` already refused for `--png`, `--3d` and `--view`, with no
  test holding it. The decision (easiest to undo, no new files in the plan's folder): keep
  refusing rather than choosing a file name beside the plan, and say which flag to add.
- The condition becomes one named function, `picturePng(request)`, in `draw.ts`, so every
  picture kind is asked the same way, and the refusal sentence is one constant.
- Tests in `packages/cli/src/command/__tests__/drawTerminal.test.ts`.

## Done

- The test runs every PNG kind with `stdoutIsTerminal: true`: exit 2, nothing on standard output,
  message names `--out`; with `false`, bytes start with the PNG signature; an SVG on a terminal
  still prints.
- typecheck, lint, the cli tests, `ownWords.test.ts` and `tolerances.test.ts`, scoreboard.
