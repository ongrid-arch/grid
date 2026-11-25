# 2026-11-25: a demolished and a new opening in the same place are no overlap when written (CNT-35)

## For people

- A widened door, its old opening to be demolished and a new one in its place, is no longer refused
  as two openings sharing 0.85 m of one wall when a plan with phases is read back as rooms text or
  written from text that states them. Grid reads each state on its own, as the drawing check
  does; an old opening beside one that stays is still said (CNT-35).

## For agents

- `rooms/openings-overlap` now reads a plan that states a phase once before the work and once
  after it, so a demolished opening and a new one that share a stretch of a wall are not a clash;
  a plan with no phase is checked as before. No new code in the record.
