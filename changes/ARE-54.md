# 2026-11-25: the area answer names the phase rule when rooms are left out (ARE-54)

## For people

- When the phases leave a room out of the areas, the answer now says so: it names the room, the wall it
  stands without, and the pattern that fixes it (rooms knocked into one are both demolished, the room they
  become is new), instead of only "could not be measured" (ARE-54).

## For agents

- `grid_areas` and `grid areas` add a note ("The phases leave … out of every total") for each room left out
  because one of its walls does not stand when it does. `PhaseClash` in the core now also carries `phase` and
  `wallPhase`. No new code in the record.
