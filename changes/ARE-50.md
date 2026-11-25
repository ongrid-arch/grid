# 2026-11-25: contradictory and misleading check notes fixed (ARE-50)

## For people

- A door too narrow to pass now gets one note, the check's, instead of that and a question saying it still counts as a way through (ARE-50).
- A ground floor whose only doors to the outside cannot be passed is no longer said to have no door to the outside: the note says its doors cannot be passed, and each has a note of its own.
- With no place stated, the report says "No place is stated, so no code figure was applied" and no longer mentions the US figures.
- Walls lower than a door (railings, parapets, balustrades) no longer set what the typical wall of a floor is, so a floor of tall walls with many low rails is not flagged for its tall walls. A floor that states its height holds its walls to that height.

## For agents

- `opening/size-question` is left out for a door that also has `opening/too-small-to-pass`: one note per opening. A window that is very narrow is still asked about.
- `floor/no-exit` on a floor with a door to the outside that cannot be passed says "has no door to the outside that a person can pass" and its `found` says its doors to the outside cannot be passed; the line's `also` lists the doors, which have their own notes.
- The place line, `grid_check`'s second line, reads "No place is stated, so no code figure was applied. State it in the plan as site.country, or give --country." `withoutPlace.usLines` stays in the record.
- `wall/size-question`: balustrades (solid walls under 2 m, the limit `wallBalustradeHighest`) are not counted in a floor's typical wall; a floor that states its height is the height a wall is compared with, and the note says "its floor states {height} m". No new code in the record.
