# 2026-11-25: a plan with one bad note, sketch item or trace image still reads (MSG-20)

## For people

- A plan with one bad note, sketch item, fact or trace image is read, drawn and checked like any other. A note longer than 120 characters, a sketch line written with `from` and `to` instead of `points`, or a trace image outside the project folder used to make the whole plan unreadable, or to drop every sketch item at once; now only that one part is left out, and `grid check` says which and why, one line each (MSG-20).

## For agents

- `loadPlan` no longer refuses a plan for its trace image. A `referenceImage.path` that leads out of the project folder (another folder, `..`, an absolute path, a web or `javascript:` address, a link out of the folder), that does not end in `.png`, `.jpg` or `.jpeg`, or that names a picture not in the folder yet is never followed. `grid check` and `grid_check` give one new `plan/trace-left-out` line (`left-out`, about the plan, at `referenceImage.path`) whose message says the path and why, and the folder for a refused path; a picture's answer (`grid_view`, `grid draw`) says why it is not drawn. The plan file keeps `referenceImage` as written, so a change written back loses nothing.
- A note's or a sketch item's text, a fact's name or value, and the trace image's path that break the text rule (too long, a line break, a control or direction character) no longer refuse the plan: the reader leaves out that note, sketch item or fact alone, or the trace image, with one `plan/value-left-out` line at its place. The names and ids of walls, rooms, openings, floors and the other building parts are still refused, as before.
- Every list of the plan the reader does not read part by part (`annotations`, `sketch`, `stairs`, `views`, `flats`, `columns` and the like) loses only its entries that cannot be read, each with its own `plan/value-left-out` line at its place in the file (`sketch[4].points`). Before, the whole list was left out in one line.

## Codes

| `plan/trace-left-out` | {thing}'s trace image is left out of every view: {why} | a PNG or JPEG picture inside the project folder, named at {place} by its path from that folder |
