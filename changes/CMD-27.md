# 2026-11-25: grid draw takes the picture format from --out (CMD-27)

## For people

- `grid draw --out site.png` writes a PNG without `--png`; the ending of the file names the format
  when no format flag does. `--png` or `--3d` with a `.svg` file is refused by name (CMD-27).

## For agents

- No new code in the record. `grid draw --out <file>.png` is a PNG for a floor plan, a facade and a
  section, with `--scale` allowed; a clash between the ending and `--png` or `--3d` is a usage
  error naming both. A PNG is still never written to a terminal.
