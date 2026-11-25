# CMD-27: the picture format comes from the --out extension

## Outcome

`grid draw --out site.png` writes a PNG without `--png`. `--out site.svg`, or an `--out` with no
extension Grid draws, still writes an SVG or is refused by name. A clash between the extension and
what the flags ask for (`--png` or `--3d` with a `.svg` file, a `.png` file with an option that
only a PNG-less SVG could mean) is refused by name, saying both. A PNG is still never written to a
terminal (CMD-25): with no `--out`, `--png` is still the only way to ask for one.

## Design

- `packages/cli/src/command/draw.ts`: `drawFormat(request)` returns the request with `png` set
  when no format is named (no `--png`, `--3d`, `--view`) and `--out` ends in `.png`. It is applied
  once in `main.ts` before `checkDrawRequest`, so every picture kind (plan, facade, section) and
  `--scale` follow it.
- `checkDrawRequest` keeps refusing an `--out` whose extension clashes with the format, now with a
  sentence that names the flag and the extension.
- Decision: only `.png` is inferred. `.svg` is already the default, and `.jpg` is not a format
  Grid draws, so it is refused as before.

## Done

- `command/__tests__/drawFormat.test.ts`: `--out x.png` writes PNG bytes for a plan, a facade and
  a section; `--out x.svg --png`, `--out x.svg --3d` and `--out x.png` with `--scale`-less SVG
  clashes are refused by name; CMD-25's terminal tests still pass.
- `ownWords` and `tolerances` tests, typecheck, lint, the cli package's tests, the scoreboard.
