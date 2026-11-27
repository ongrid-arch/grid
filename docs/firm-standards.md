# A firm's own standards

Read this when a firm wants its own figures, such as corridors at least 1.5 m, set against its
plans, or needs to know what a `firm/` note in a check means.

- [The file](#the-file)
- [What a standard can measure](#what-a-standard-can-measure)
- [What the check says](#what-the-check-says)
- [A file Grid cannot read](#a-file-grid-cannot-read)
- [Skills a firm can own](#skills-a-firm-can-own)

## The file

A firm keeps its standards in `firm-standards.json`, in the plan's folder. Every plan in that
folder is set against them; a plan in another folder needs its own copy. It is plain JSON, so a
firm can keep it in git with its projects and change it like any other file it owns. Grid reads
it through the project folder, as every file, and writes nothing to it. The plan knows nothing
of it, and no export, sheet or drawing reads it.

```json
{
  "version": "1",
  "heading": "The firm's own standards: the firm's figures, not from any code or standard.",
  "standards": [
    { "measure": "corridor_width", "value": 1.5, "unit": "m", "name": "Corridors" },
    { "measure": "door_clear_width", "value": 850, "unit": "mm", "note": "Our office guide, part 3" },
    { "measure": "room_area", "value": 9, "unit": "m²", "uses": ["office"] },
    { "measure": "fixture_clearance", "value": 0.8, "unit": "m", "kinds": ["toilet"] },
    { "measure": "fixture_clearance", "value": 0.7, "width": 0.8, "unit": "m", "kinds": ["toilet"] }
  ]
}
```

- `version` is `"1"`. `heading` is optional, any one line of text, and Grid does not read it.
- `standards` lists at most 200. Each has a `measure` from the list below, a least `value` and
  its `unit`: `m` or `mm` for a length, `m²` (or `m2`) for an area. A firm can list a measure more
  than once, for different rooms.
- `name` and `note` are the firm's own words (a name up to 120 characters, a note up to 300):
  what the firm calls the standard, and where it comes from.
- `uses` limits a measure about rooms to the rooms of those uses (`office`, `meeting`, …, the
  room uses of [plan-file.md](plan-file.md)). `kinds` limits the floor in front of a fixture to
  those fixture kinds: any fixture kind the kinds registry holds (`toilet`, `basin`, `shower`,
  `bath`, `kitchen-run`, the equipment and any kind added to it).
- `width` (ARE-73), on `fixture_clearance` only, in the standard's unit: the floor in front of each
  fixture is then an activity zone on its centre line, as wide as this and as deep as `value`, as
  `grid_measure what=activity` measures it ([tool-server.md](tool-server.md#activity-zones-in-front-of-fixtures-per-kind)).

Every figure in the file is the firm's own. It cites no document and has no status: a field that
a code's figure carries (`document`, `edition`, `clause`, `source`, `status`, …) is refused and
says so. Say where a figure comes from in the firm's words, in `note`. The note stays with the figure: each `firm/` line says it in what is needed, and its `firm` record carries it (ARE-27). The firm's figures are not
tied to a place: they are set against the plan whatever place it states, or none.

## What a standard can measure

Each is a least size, measured by a measure Grid already has, so the firm's figure and the
drawing are measured the same way as everywhere else.

| `measure` | What is measured | Unit |
|---|---|---|
| `corridor_width` | The narrowest point of each room used as a corridor (or each room of `uses`) from end to end, as `grid_measure what=access` gives it ([tool-server.md](tool-server.md#accessibility-measurements-as-numbers)): its ends are the sides of its outline no wider than it that turn into it at both corners, farthest apart, and the width is the widest body or trolley that gets from one to the other, clear of its walls and fixtures. A door does not narrow it; a door is `door_clear_width`. A grid of points finds where it is narrowest, and the width there is measured to the walls and fixtures themselves, so a corridor whose walls stand 1.5 m apart measures 1.5 m. With no two ends, the widest circle it holds. | m |
| `door_clear_width` | What each door and doorless opening leaves clear, leaf by leaf: the leaf it opens by, or both leaves of a pair that states none, less what an open leaf and its stop take for a door that swings or folds, and what fixtures stand in front of it. The same width the brief and `grid_measure what=access` judge a door by ([brief.md](brief.md)) | m |
| `turning_circle` | The widest circle each room's free floor holds, clear of its walls and fixtures | m |
| `fixture_clearance` | The clear floor straight out from the front of each fixture to the nearest wall face, doorway or other fixture. With `width`, the clear floor straight out over a zone that wide on the fixture's centre line, a part of it on no free floor read as nothing, and the line gives the clear width to each side of the centre line by compass; units side by side in one run are one zone | m |
| `room_area` | Each room's net area, to the faces of its walls, as `grid_areas` gives it | m² |
| `room_width` | The widest circle each empty room holds between its wall faces: for a rectangle, its shorter side | m |

A corridor's width, a doorway's clear width and a turning circle are the same numbers
`grid_measure what=access` gives (CNT-17): the firm's figure is set against those numbers in
`grid check`, and the access answer keeps its own figures, the person's and a confirmed code's.

The room measures look at every room but zones, which are part of a room; `corridor_width` looks
at the rooms used as `corridor` unless `uses` names others. Grid holds no desks or other
furniture yet, so a standard about them cannot be measured.

## What the check says

`grid check` and `grid_check` read the file and give a note for each part short of the firm's
figure, with a `firm/` code. The notes come after the code figures' findings, under their own
heading:

```text
The firm's own standards (1), from "firm-standards.json": the firm's own figures, from its file beside the plan: not from any code or standard, and not tied to a place, so they are set against the plan wherever that file is.
  1. finding, room "hall": Room "Hall": the way through is 1.30 m wide at its narrowest, under the firm's own figure of 1.5 m for corridor width ("Corridors"). [firm/corridor-width]
      found: 1.30 m, from end to end, at its narrowest at (5.30, 7.42); measured as the narrowest point of each room used as a corridor from end to end, …
      needed: at least 1.5 m: the firm's figure used here ("Corridors"), from "firm-standards.json", the firm's own and not from any code or standard
```

- The count says how many findings are the firm's: "To look at (1): 1 finding of the firm's own."
- A firm note counts as a finding. It never carries a code's figure, and the firm's figures are
  never listed with the code figures.
- A note can be set aside as seen, by its number, as any note (`grid check --seen`,
  `grid_mark_seen`).
- With no part short of the firm's figures, the report says so in one line, with how many
  standards were set against how many parts.
- `--full` (`full=true`) lists each standard: "the firm's figure used here is at least 1.5 m",
  how many parts it was set against and how many are short of it.

A part that is not short of the firm's figure only means that: nothing about any rule. The
codes, and the record's `firm` fields, are in [result-contract.md](result-contract.md#the-firms-own-standards).

## A file Grid cannot read

A file that is not JSON, or not a list of standards Grid knows, is one note, `firm/not-read`,
which says where the file is wrong and never repeats its text: "firm-standards.json: standards[0]
holds "clause", which a code's figure carries: a firm's standard is the firm's own and cites no
code." The plan is checked as if the file were not there. A file that is a link out of the
project folder is refused, as every path is.

## Skills a firm can own

The plugin for Claude Code and Codex carries Grid's skill and four more, each a plain
`SKILL.md` a firm can copy into its own repository and change to its own ways of working:

| Skill | When |
|---|---|
| `firm-standards` | Writing the firm's standards file, and reading its notes |
| `room-programme` | From a list of rooms with their sizes to a brief and a plan |
| `option-table` | Two or more layouts side by side, as a table of areas, rooms and notes |
| `dimensioning` | The sizes along the walls, the rooms' inside sizes and the clear widths, on a drawing or a sheet |
