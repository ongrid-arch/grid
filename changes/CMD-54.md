# 2026-11-27: rooms text tried without writing a plan (CMD-54)

## For people

- `grid write <plan.rooms> --dry-run` tries the rooms text against the plan and answers as the
  write would, writing nothing, so learning the grammar or checking a change leaves no scratch
  plan in the folder (CMD-54).

## For agents

- `grid_write_rooms` takes `dry_run` (boolean): true compiles `rooms` or `roomsFile` against the
  plan as it is and answers as the write would (rooms, walls, guesses, warnings, the verdict
  against the plan now, `drawingProblems`, `toLookAt`, the brief's lines) and writes nothing: no
  plan file, no change log entry, no checkpoint. Its first line is `Dry run: tried the rooms
  text against "<plan>" and wrote nothing, ...`; `written` names the plan it was tried against.
  Text with problems, and text a write would refuse (stale, the plan changed, floors dropped), is
  refused as the write refuses it. With `layout`, `scan` or `from` it is refused by name. The
  data gains `dryRun` (true for a dry run, else false). `grid write --dry-run` does the same, and
  its `--json` gains `dryRun`. No new code in the record.
