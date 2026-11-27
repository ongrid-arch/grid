# CNT-53 — Opening phases in schedules

## Outcome

The opening, door and window schedules show which openings are existing, new or to be
removed. The text and CSV include removals after the openings that will stand after the work.

## Design

Use Grid's phase reading and the opening facts from the state in which each opening stands.
Keep the marks and totals of the after-work schedule. Append removed openings from the
before-work state and give them distinct marks. Group the door and window types by phase so
each type row has a single phase. Put the phase on each row and use a section column in CSV
to keep the file rectangular. The grouped default remains an after-work count by size.

The schedule tool supplies the loaded plan to the opening schedule helpers. The existing
drawing, export and sheet callers continue to use the after-work survey.

## Done

Check all three schedule views in text, CSV and structured data. Cover an unstated phase, a
phase inherited from a wall, a removal whose room no longer stands, and floor filtering.
Check that after-work counts and marks still agree with existing callers. Run the build,
type check, lint, affected tests, tolerance check and scoreboard.
