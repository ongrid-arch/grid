# 2026-11-25: a window below the ground is not counted as a way out (ARE-19)

## For people

- When the plan states the ground level, a bedroom's window or door in an outside wall that lies
  below the ground is no longer counted as a way to escape. A bedroom whose only outside openings
  lie below the ground is reported as having no window or door to escape through, and the line says
  why and points to the note on each opening. An opening with a light well or other outdoor space
  drawn in front of it is still counted (ARE-19).

## For agents

- `room/no-escape-opening` now also covers a room whose outside openings were all left out for
  lying below the ground the site states (the ones `opening/below-ground` names). Its message
  and `found` say so ("... lie below the ground"), and the finding's `openings` lists those openings,
  so they can be read beside their own `opening/below-ground` notes. A room with no such opening
  keeps the earlier wording and an empty `openings`. A plan that states no ground reads as before.
  No new code in the record.
