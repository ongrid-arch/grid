# 2026-11-25: no picture bytes on a terminal (CMD-25)

## For people

- `grid draw` with a PNG (`--png`, `--3d`, `--view`, a facade or a section as a PNG) and no `--out`
  is refused when the output is a terminal, and says to name a file with `--out`. Nothing is
  printed. Sent to a file or another program it writes the picture as before (CMD-25).

## For agents

- No new code in the record. `grid draw` is a command, not a tool: the refusal is a usage error
  (exit 2) naming `--out`.
