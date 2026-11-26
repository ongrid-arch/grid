# 2026-11-26: the ground level in rooms text, named wherever a plan states none (ARE-62)

## For people

- Rooms text writes where the ground outside is in a line of its own: `ground -0.15` for a floor 15 cm above the ground, `ground 0` for one at it, or the distance and its way, `ground 0.15 below`. The sections, the facades, the 3D ground and the check of doors and windows below the ground read it, `grid describe --as rooms` writes it back the same way, and wherever Grid says a plan states no ground level it now says how to state it (ARE-62).

## For agents

- Rooms text: `ground <m>` (also `ground level <m>`, `ground at <m>`, `ground <m> below|above [the ground floor]`, a length with its unit) sets `site.ground`, in metres from the ground floor's floor level. `site ground <m>` reads the same; writing both is refused (`rooms/site`) with the line of the first. The read-back writes `ground <m>` in place of `site ground <m>`. `raw site` is told about the `ground` line.
- The answers that find no ground level name the `ground` line and `grid_set_site ground`: the `no_ground_level` skip reason of the below-ground check in `grid_check`, the section's "taken" note on the ground in `grid_view kind=section`, the ground line of `grid_view kind=facade`, the entrance-step "cannot tell" of `grid_measure what=access`, and the building-height rule of a brief's limits. The fix of `opening/below-ground` names them too. The drawn labels on the pictures are unchanged.
- `grid_set_site`: its description names the ground level and the `ground` line; the `ground` argument says what reads it and that a basement is set by its floor's elevation. No new code in the record.
