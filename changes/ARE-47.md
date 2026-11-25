# 2026-11-25: small figures are not rounded past their verdict (ARE-47)

## For people

- A step, sill or tolerance under 0.1 m is written to three decimals in metres (a 15 mm step reads
  0.015 m, not 0.01 m), and a figure you gave in the brief is written back exactly as you gave it
  (ARE-47).

## For agents

- `grid_measure what=access`, and the brief's lines, write a drawn length under 0.1 m to three
  decimals in metres, and "your figure of …" exactly as given in the display's unit. Larger
  figures keep their two decimals. No new code in the record.
