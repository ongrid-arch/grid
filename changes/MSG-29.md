# 2026-11-25: a change names the seen notes it made new again (MSG-29)

## For people

- When a change to the plan brings back a note someone had set aside as seen, the answer says so:
  the note's number, who marked it, on which day and why, and which of its parts changed.
  `grid diff` says the same of the notes seen on the earlier version. A note marked with
  `--country` is counted again for that country, so its number is the one that report gives
  (MSG-29).

## For agents

- Every tool that changes the plan (the `EDIT_OUTPUT` tools) and `grid_diff` add `seenNew`: each
  note whose seen mark held before and holds no more, as `{ number, code, thing, country, by, at,
  reason, changed, text }`; empty when none came back, and always empty for a change written to
  another file with `out`. Its `text` is printed after the "To look at" line of a change, and after
  the issues of a diff: "Seen note {number} is new again[, counted for {country} as when it was
  marked]: {note} It was seen {by}; {parts} changed since." At most ten are printed; the data holds
  them all.
- A seen mark in `<plan>.seen.json` may hold `country`, the code of the country the check was given
  when the note was marked (`grid_mark_seen` with `country`, `grid check --country … --seen`). The
  file stays version 1, and a mark without it reads as before.
- No new code in the record.
