# 2026-11-25: the 3D cutaway cuts the walls of a floor, one storey or several (VEW-58)

## For people

- A floor shown as a cutaway in 3D now has its walls cut down to 1.2 m above its floor, so you can see into its rooms from above. A one-storey building shown as a cutaway used to come out as the same closed drum as the whole building; the whole building is drawn as before (VEW-58).

## For agents

- `grid draw --3d --floor <id>`, a saved view's `cut` and `grid_draw` with a floor cut away give a picture with that floor's walls at 1.2 m (the plan's own cut height), doors and windows cut with them, for a plan of one storey as well as of several. No new code in the record.
