# The result contract

This is what Grid tells an agent about a plan, written down before more is built on it
(MSG-1). It covers the result record, refusals, the receipts of the tools that change or
write something, the promise about what may change, and a changelog for agents. A change
writes its entry, and any new code's row of the code table, in its own file in `changes/`
(`changes/README.md`); the release step puts them at the top of that changelog and in the
table, and the release's heading above the entries it ships, so an entry under a release
heading shipped in that release (QAR-10, RELEASING.md).

Every record, every rendering of it and every report starts with the label "General
guidance, not your local rules". No line says a plan complies, passes or is approved: a
record with no lines only means these checks found nothing.

The code is `packages/rules/src/result/` (`types.ts` for the record, `catalogue.ts` for the
codes, `inspect.ts` for the front door). Tests hold the code to this file:
`packages/rules/src/result/__tests__/contract.test.ts` fails when a code is in one and not
the other.

## The front door

```ts
import { inspectPlan } from '@ongrid/rules'

const result = inspectPlan(raw, { country: 'ES' })
```

`inspectPlan(raw, options?)` takes the plan as parsed JSON, or as its text, and the options of
the full check (`country`, `figures`, `withoutPlace`). It reads the plan, runs every check, and
returns one record. The figure checks are for the place the plan states (`site.country`), or
the `country` given here in its place: a name or a code on Grid's list, such as `US`, `USA`,
`United States` or `Spain` (COD-3). With no place stated, no figure is applied; see "The
place". It never throws: a check that fails inside Grid becomes a line
(`plan/check-failed`), and the other checks still run. Run over the 3,000 damaged plans and
442 sound plans of the scoreboard, it gives 0 exceptions and 0 failed checks
(`scoreboard/__tests__/frontDoor.test.ts`).

`grid check` prints the record (`--json` gives it as `result`), and `grid_check` returns its
`count` and `lines` beside the older lists, which it keeps for now. Both print a short report by
default, and the whole one on request (MSG-10, see "The short report, and seen notes").

## The record

| Field | What it holds |
|---|---|
| `resultVersion` | `1`. Raised only when a field changes meaning or is taken away. |
| `label` | "General guidance, not your local rules", in the record's language (MSG-11). |
| `language` | Only when the record is not in English: `es`. See "Languages". |
| `read` | `false` when the plan was refused. Then the lines are its refusals and nothing else ran. |
| `count` | How many lines there are: the one number for how much there is to look at. |
| `counts` | The same lines by kind. They add up to `count`. |
| `problems` | How many lines follow from no other line and are not `not-checked`: the problems to act on (MSG-5). See "Causes and follow-ons". |
| `lines` | Every line, in the order of the kinds below. Lines of one kind keep the order their check gave them. A line that follows from another comes right under it, whatever its kind (MSG-5). |
| `basis` | `general-baseline`, or `local-lookup` once a looked-up figure was applied. |
| `lookupNotice` | Only with `local-lookup`: the figures were found by an AI and not checked by a person. |
| `checks` | Every check that ran and looked at something, with where its figures come from. A check that looked at no room, floor or door is not listed (MSG-2). Empty when the plan was refused. |
| `coverage` | What each check looked at and skipped, one entry per check Grid has, whether it ran or not. See "What each check looked at". Empty when the plan was refused. |
| `figures` | Every figure a check applied, with its document, edition, clause, place, day read, status and `readFor`, the kind of building it was read for (`homes` for every figure today). The figures of a check that looked at nothing are not listed. |
| `limits` | What these checks never look at, whatever the plan. The same lines every time. |
| `place` | The place the figure checks were for (COD-3): `country`, its two-letter code; `name`, Grid's name for it; `from`, `request` (the caller's `country`), `plan` (`site.country`) or `assumed` (`withoutPlace: "us-figures"`). `null` when no place is stated, and then no figure was applied; `null` too when the plan was refused. |
| `withoutPlace` | Only on a plan that was read and states no place: `{ usLines }`, how many lines the figure checks would have given with the US figures. |
| `taped` | Only on a plan that keeps taped lengths (HND-11): each one, in the plan's order, taped against drawn. See "Taped against drawn". |
| `firm` | Only when the plan has a firm's standards file beside it (COD-8): `{ heading, file, read, standards }`, each standard with its `measure`, `value`, `unit`, `name`, `note`, `uses`, `kinds`, `lookedAt` (the parts it was set against) and `notes` (those short of it). See "The firm's own standards". |

### A line

| Field | What it holds |
|---|---|
| `code` | Stable: `<thing>/<what>`, lowercase words joined by dashes, or `firm/<what>` for the firm's own standards (COD-8). One of the codes below. |
| `kind` | `refused`, `left-out`, `worth-a-look`, `finding`, `not-checked` or `to-confirm`. |
| `thing` | `{ kind, id }`: the plan (id `""`), a floor, a wall, a room, an opening, a fixture (`item`, CNT-12), a stair (LVL-3), an opening pattern (`pattern`, LVL-8) or a flat (`flat`, CNT-4). A flat is on the floor of its first room. |
| `floor` | The id of the floor the thing is on. `null` for the plan as a whole, and for an opening on a wall the plan does not have. |
| `also` | The ids of the other parts the line names: the wall a door hits, the rooms a finding names. |
| `message` | The one wording of the code, with the plan's names in quotes and the figures filled in. |
| `found` | What was found, in words and figures. For a problem in the drawing it is the check's own sentence. |
| `needed` | What would be right. |
| `fix` | What to change. A suggestion: the plan is the author's. |
| `figures` | Only on a finding that compared the plan with a figure: those figures, as in `figures` above. |
| `values` | Only when the line's words name a figure, a name, an id or a place (MSG-11): those values, by the names its wording gives them, the same in every language. A figure is a number, rounded as the words give it. |
| `causedBy` | Only on a line that follows from another (MSG-5): that line, as `{ code, id }`, the id of the part it is about (`""` for the plan; for `plan/duplicate-id`, the id it names). The line is listed under it and goes away when it is fixed. |
| `each` | Only on a line that stands for the same note on several parts (MSG-5): each of them, `{ kind, id }`, `thing` first. Its message lists their names. |
| `held` | Only on `floor/not-checked-rooms-not-drawn` and `floor/not-checked-doors-not-drawn` (MSG-5): the notes held back because they rest on what the line names, each `{ code, thing, floor, also, waitsFor }`. `waitsFor` holds the ids of the rooms and openings that could not be drawn. |
| `firm` | Only on a `firm/` line (COD-8): the firm's own figure it was set against, `{ standard, measure, value, unit, name, note, file }`, `standard` its place in the file's list from 0 and `note` the firm's own note on where the figure comes from, or null (ARE-27). Never a code's: such a line has no `figures`. |
| `fixes` | Only where a change to one part would clear the line (MSG-7): each such change as data, `{ part: "opening", id, width \| offset \| height \| sill \| wall }`. Several when more than one would do. `width` keeps the opening's start; `wall` is the id most likely meant. In `grid_check`, each line with fixes also carries `calls`: the same changes as calls to `grid_change_opening`, with the plan argument, ready to send. A `wall` fix has no call: no tool sets an opening's wall. |

### The kinds, in list order

1. `refused`: the plan could not be read. Nothing else was checked.
2. `left-out`: a part that cannot be drawn. Every view, measure and export skips it.
3. `worth-a-look`: a part that is drawn and is very likely a mistake, door sweeps among them;
   and first, what the file says that Grid does not read (below).
4. `finding`: what a plan check found: a way out, a door, a room's size, an escape window.
5. `not-checked`: what a check could not look at in this plan, and why.
6. `to-confirm`: a value the plan marks assumed, for the person to confirm (WRT-6). Last, so the
   other lines keep their numbers when an agent marks what it assumed.

### Causes and follow-ons

One broken part used to give a pile of lines with no root marked, and false notes about sound
rooms beside it (lab MS-4, MS-5, W-6, W-7). Since MSG-5:

- **A line that follows from another carries `causedBy` and comes right under it.** A door on a
  wall that cannot be drawn (`opening/broken-wall`) and a room that rests on one
  (`room/broken-wall`) follow from the wall's line, or from the reader's line for a wall it left
  out (`plan/part-left-out`), or from `plan/duplicate-id` for an id two walls share. Enclosed
  floor no room claims (`floor/unclaimed`) follows from the room that could not be drawn there,
  and so does a fixture said to stand in no room (`item/outside-rooms`) whose middle is on that
  floor. A fixture in front of a doorway or a window (`item/blocks-doorway`,
  `item/blocks-window`) is measured from the wall, the opening and the fixture alone, so it
  follows from nothing; for an opening or a wall that cannot be drawn it is not given, and the
  floor's "could not be drawn" line names the opening. A room measured as if closed by a wall that stops short or leaves a gap: its
  `room/space-mismatch`, `room/not-enclosed` and `room/overlap` lines, and the walls found
  standing in it, follow from that wall's line. A plan with no walls gives `plan/no-walls`, and
  every room and opening line follows from it. A plan that may not be in metres
  (`plan/units-question`) files under it what is measured against a size (`plan/far-from-origin`,
  the size questions, `room/too-small` and the escape-window findings), and it follows from the
  reader's `plan/value-left-out` for a stated unit Grid reads as metres.
- **A note that rests on a part that could not be drawn is held back.** The rule: a way out or
  a route, when any room or opening on its floors could not be drawn; "no door", when the room
  shares a wall with a room or an opening that could not be drawn, or an opening could be placed
  on no wall; a door into a space not drawn, when a room that could not be drawn rests on its
  wall; an escape note, when an opening on one of the room's walls could not be drawn, or could
  be placed on no wall. The floor's `floor/not-checked-rooms-not-drawn` or
  `floor/not-checked-doors-not-drawn` line names the parts and carries each note held back
  under `held`. "Could not be drawn" covers what the drawing check leaves out and what the reader
  left out. A held note comes back once the part is drawn, if it still holds; a note that
  happens to be true is held too.
- **Identical notes are one line.** Findings of one code on one floor that say the same in every
  word but the room's name (`found`, `needed`, `fix` and `figures`) are one line that lists the
  rooms where the one name goes, the verb agreeing ("The windows of "Room 301", "Room 302" are
  too high to escape through"). `each` and `also` keep every id. The notes a person reads on the
  plan stay one per room.

`problems` counts the lines with no `causedBy`, `not-checked` lines aside. `grid check` sets each
follow-on under its cause and prints "N problems; M lines follow from them", and the notes held
back under their line.

### A line's number

A line's number is its place in `lines`, counting from 1. `grid check` prints it before the line,
and keeps it when only one floor is shown (`--floor`), so a floor's lines can skip numbers.
`grid draw` and `grid_view` mark each line with the same number on the part it is about, and
list them under the drawing (MSG-8). The numbers follow the record the drawing was made from:
`grid check --country` can add or take away lines, and with them change the numbers after them.

### One wording per code

A line's `message` is made by its code's wording, and nowhere else: the words are keys of the
message files (`line.<code>.says`, `.found`, `.needed`, `.fix` in
`packages/floorplan/src/messages/`, one file per language, MSG-11), and `catalogue.ts` says which
values each takes. A finding's wording is its check's own (`check.*` keys, said by
`checks/messages.ts` and `planCheckSaids` in `@ongrid/floorplan`), so the report's `message`, the
notes a person reads and the record say the same words. A test fails when one code is worded two
ways (AU4-1).

### The label, and words no line uses

The label "General guidance, not your local rules" is the first line of every report and every
list Grid prints or a tool answers, and every tool answer carries it as `label` in its data
(MSG-3). Drawings carry it in their top-left corner, and every export file in a place its
format keeps: a text over the plan in DXF, the header and the project's description in IFC,
`asset.extras.label` in GLB, the first comment in OBJ, the first cell of a CSV, a comment on
the first line of rooms text, and the footer of every sheet page.

No line Grid writes holds pass, complies, compliant, approved, meets code or their kin, outside
the user's own quoted text (`approvalWords` in `@ongrid/rules`; message codes in brackets are
identifiers and are left out). A figure is given as the figure used here, with its basis (the
document, edition and clause, or where it was looked up) and its status, never as what the
plan or the reader needs. A check that looked at nothing says "Nothing was checked for …".
`scoreboard/__tests__/approvalWords.test.ts` holds the reports and the exports of the lab's
plans to this, and `src/__tests__/label.test.ts` in `packages/cli` holds every output to the
label.

## Languages

A record is said in one language (MSG-11): English unless the call asks for another
(`inspectPlan(raw, { language: 'es' })`, `grid check --lang es`, `language` on `grid_check`) or
the plan states one (`display.language`). The codes, the kinds, the things, the figures, `fixes`
and `values` do not change with the language; `label`, `message`, `found`, `needed` and `fix`
do, and so do the checks' titles, the coverage reasons and the limits. A wording comes from the
message files, one per language (`docs/languages.md`), never written twice. Spanish is a draft
translation no person has reviewed yet, and its figures have a decimal comma unless the plan's
display chooses a point. Names from the plan are never translated.

## The codes

`{thing}` is the part as a line names it: `Wall "w1"`, `Door "d1"`, `Room "Kitchen"`, `Floor
"Ground floor"`, a fixture by its kind (`Toilet "wc1"`, CNT-12) or `The plan`. Names in quotes are the plan's own text.

| Code | Wording | Needed |
|---|---|---|
| `plan/not-json` | The plan is not JSON | a plan file in JSON |
| `plan/not-an-object` | The plan is not a JSON object | one JSON object with walls, rooms and openings |
| `plan/missing-field` | {thing} is missing a field the format needs | {wanted} at {place} |
| `plan/wrong-type` | {thing} has a field of the wrong type | {wanted} at {place} |
| `plan/unknown-word` | {thing} has a word the format does not know | {wanted} at {place} |
| `plan/out-of-range` | {thing} has a value out of range | {wanted} at {place} |
| `plan/not-in-format` | {thing} has a field the format cannot read | {wanted} at {place} |
| `plan/unknown-field` | {thing} has a field Grid does not know, "{field}" | one of the fields of {part}: … |
| `plan/site-things-drawn-only` | The site's things are drawn only: {1 fence, 3 trees and 1 pool}, not measured or checked, and never taken as a wall, a room or a storey's height | nothing: the site's things are for the drawing |
| `plan/not-checked-boundary` | No distance to the plot's boundary was measured: {why the building has no outline} | walls that close the building's outline, on a floor at or above the ground floor |
| `plan/boundary-crosses` | The site's boundary is not one closed shape, so no distance to it and no plot coverage is measured | the plot's corners in order round it, each edge meeting only the next |
| `plan/note-no-place` | Note "{id}" names a room the plan does not have, so it is not drawn | a room id from the plan, or a point (at) |
| `plan/front-not-said` | The front names wall "{id}", which the plan does not have, so no front is said | a wall that faces outside, or an opening in one, such as the front door |
| `plan/y-down` | The plan says its y runs down the page, so every drawing and export shows the building mirrored; which way its walls face is read the right way round | a plan whose y runs up the page, as Grid draws it |
| `plan/unknown-use` | Room "{name}" has a use Grid does not know, "{use}" | one of the uses Grid knows: bedroom, living, … |
| `plan/empty` | The plan has nothing in it: no walls, rooms or openings | walls, and the rooms and openings they hold |
| `plan/unfinished-merge` | The plan holds an unfinished git merge | one plan, with the merge finished |
| `plan/part-left-out` | {thing} is left out: a value it needs cannot be read | {wanted} at {place} |
| `plan/value-left-out` | {thing} has a value the format cannot read, and is read without it | {wanted} at {place} |
| `plan/read-as-meant` | {thing} has a value written another way, and it is read as meant | {wanted} at {place} |
| `plan/blank-id` | {thing} is left out: its id is blank | an id of its own on every part, with more than spaces in it |
| `plan/id-clash` | {thing} is left out: another part has the same id | every id on one part only, across the whole plan |
| `plan/similar-id` | {thing} is left out: its id differs from another part's only in capitals or spaces | ids that differ in more than capitals or spaces |
| `plan/check-failed` | A check could not run on this plan: something went wrong inside Grid | the check to run to the end |
| `plan/no-walls` | The plan has no walls, but its rooms and openings name walls | the walls the rooms and openings name |
| `plan/far-from-origin` | The plan reaches more than 500 m from the origin | every point within 500 m of the origin: the site's origin where the plan states one, else (0, 0) |
| `plan/duplicate-id` | Id {thing} names more than one wall, room or opening | every id on one wall, room or opening only |
| `plan/similar-floor-id` | {thing} has an id that differs from another floor's only in capitals or spaces | floor ids that differ in more than capitals or spaces |
| `plan/duplicate-floor` | {thing} is listed more than once | each floor listed once |
| `plan/units-question` | The plan may not be in metres | every length in metres |
| `plan/level-gap` | The plan skips a floor level | floor levels with no gap, or an elevation in metres on each floor |
| `plan/same-level` | {thing} is at the same level as another floor | each floor at its own level, or an elevation in metres on each |
| `wall/too-large` | {thing} has a number Grid does not accept | finite numbers within the size Grid accepts |
| `wall/zero-length` | {thing} has no length | a start and an end at different points |
| `wall/arc-ends-apart` | {thing} does not end where its curve takes it | an end on the circle where the sweep takes the start round the centre |
| `wall/arc-too-tight` | {thing} curves round too small a radius | a radius, from the centre to the start, over half the wall's thickness |
| `wall/no-thickness` | {thing} has no thickness | a thickness above 0, or a virtual wall for a line with no substance |
| `wall/no-height` | {thing} has no height | a height above 0, or a virtual wall for a line with no substance |
| `wall/unknown-floor` | {thing} is on a floor the plan does not list | a floor from the plan's floors |
| `wall/kind-differs` | {thing} is stated as one kind, but the rooms on its sides show another | a kind that matches the rooms on its sides |
| `wall/ends-in-opening` | {thing} ends on another wall inside one of its openings | a wall that meets another clear of its doors and windows |
| `wall/size-question` | {thing} has a size that may not be meant | the size of a wall in a building |
| `wall/short` | {thing} stops short of a corner | wall ends that meet at the corner |
| `wall/gap` | {thing} leaves a gap in a straight side of a room | the walls of a side meeting end to end |
| `wall/overrun` | {thing} runs past its corner | a wall that ends at its corner |
| `wall/duplicate` | {thing} lies over another wall | each wall drawn once |
| `wall/line-on-wall` | {thing} is a dividing line drawn over a wall | a wall or a dividing line, not both |
| `wall/crosses-room` | {thing} runs across a room that does not list it | every wall across a room listed by the rooms on its sides |
| `wall/stands-in-room` | {thing} stands inside a room that does not list it | a wall inside a room drawn as part of a room |
| `wall/above-storey` | {thing} is higher than the storey its floor states | walls no higher than their floor's stated height |
| `wall/through-floor` | {thing} rises through a floor that is not above its own, so it stands on its own floor only | through naming a floor above the wall's own, from the plan's floors |
| `opening/too-large` | {thing} has a number Grid does not accept | finite numbers within the size Grid accepts |
| `opening/broken-wall` | {thing} is on a wall that cannot be drawn | a wall that can be drawn |
| `opening/missing-wall` | {thing} is on a wall that is not in the plan | the id of a wall in the plan |
| `opening/degenerate` | {thing} has no size | a width and a height above 0 |
| `opening/out-of-wall` | {thing} runs off its wall | its offset and width within the wall's length |
| `opening/too-tall` | {thing} reaches above the top of its wall | its sill and height together no higher than the wall |
| `opening/above-roof` | {thing} reaches above the roof over its wall | its sill and height together no higher than the roof over that stretch of its wall |
| `opening/negative-sill` | {thing} has its sill below the floor | a sill at 0 or above |
| `opening/overlap` | {thing} overlaps another opening on its wall | openings on one wall that share no part of it |
| `opening/phase-wall` | {thing} stands when its wall does not, so it is left out | an opening that stands only while its wall does: a new opening in an existing or new wall, an existing or demolished one in an existing wall |
| `opening/size-question` | {thing} has a size that may not be meant | the size of a door or window in a building |
| `opening/swing-without-hinge` | {thing} says which way it opens but not which side it hangs on | both its hinge ("start" or "end") and its swing ("left" or "right") |
| `opening/hinge-without-swing` | {thing} says which side it hangs on but not which way it opens | both its hinge ("start" or "end") and its swing ("left" or "right") |
| `opening/door-blocked` | {thing} hits a wall when it opens | floor clear of walls where its leaf swings |
| `opening/door-hits-item` | {thing} hits {the fixtures, by kind and id} when it opens | floor clear of fixtures where its leaf swings |
| `opening/doors-collide` | {thing} hits another door when they open | door sweeps that do not overlap |
| `opening/wide-single-leaf` | {thing} states no kind, so it is checked as one swinging leaf this wide and drawn as Grid's guess, a pair or a sliding door | its kind: single, double, sliding, pocket, folding, roller or garage |
| `opening/kind-not-for-type` | {thing} states a kind it cannot be, so it is drawn with no kind | a door kind on a door (single, double, sliding, pocket, folding, roller, garage) and a window kind on a window (single, double, sliding, fixed, high-level); none on a doorless opening |
| `opening/part-too-large` | {thing} states a part that opens that cannot open there, so it is taken as the whole opening | a part that opens no wider and no higher than its opening, on a door or a window that is not fixed |
| `opening/crosses-wall` | {thing} runs into a wall that meets its wall | an opening within the clear run of its wall, between the walls that meet it |
| `opening/fills-wall` | {thing} is as long as its wall | some wall left beside an opening |
| `opening/on-dividing-line` | {thing} is on a dividing line | a door or window in a wall |
| `opening/window-between-rooms` | {thing} has rooms on both sides | a window in a wall with the outside on one side, unless it is a borrowed light |
| `room/unknown-floor` | {thing} is on a floor the plan does not list | a floor from the plan's floors |
| `room/cross-floor` | {thing} rests on a wall of another floor | every wall it lists standing on its own floor |
| `room/broken-wall` | {thing} rests on a wall that cannot be drawn | walls that can be drawn |
| `room/phase-wall` | {thing} stands when one of its walls does not, so it is left out | a room whose walls stand whenever it does: an existing room round existing walls, a new room round existing or new walls, a demolished room round existing or demolished walls |
| `room/empty` | {thing} encloses no floor | walls that enclose some floor |
| `room/unclosed` | {thing} cannot be closed from the walls it lists | at least three walls in the plan, each meeting the next, round the room |
| `room/out-of-order` | {thing} lists its walls out of order | its walls in order round the room, each meeting the next |
| `room/inside-out` | {thing} has walls thicker than the gap between them | inner wall faces that do not cross |
| `room/hole-outside` | {thing} has a hole that does not lie inside it | a hole inside the room, with floor all round it |
| `room/holes-overlap` | {thing} has two holes that overlap or touch | floor between any two holes |
| `room/derived-edited` | {thing}'s boundary was changed by hand in a plan written rooms first | walls worked out from the rooms text |
| `room/not-enclosed` | {thing} is not enclosed by its walls | walls that reach each other round the room |
| `room/space-mismatch` | {thing} does not match the space its walls enclose | a room that covers the space its walls close off, and no more |
| `room/inside-no-host` | {thing} is marked as inside another room, but no room holds it | a room on its floor that holds it |
| `room/zone-not-in-room` | {thing} is marked as a zone of a room it does not lie in | a room on its floor, not a zone itself, that holds the whole zone |
| `room/overlap` | {thing} overlaps another room | rooms that share no floor, or one marked inside the other |
| `room/overlap-unknown` | {thing} could not be compared with another room to see whether they overlap | room outlines Grid can compare |
| `room/wall-listed-twice` | {thing} lists a wall more than once | each wall once in its list |
| `room/size-question` | {thing} has a size that may not be meant | the size of a room in a building |
| `room/offset-question` | {thing} stands far above or below its storey's floor | a room's step within what a storey holds, or a floor of its own |
| `stair/unknown-floor` | {thing} joins a floor the plan does not know | the ids of two floors the plan has |
| `stair/same-floor` | {thing} starts and ends on one floor | two different floors |
| `stair/no-rise` | {thing} joins floors that stand at one height | two floors at different heights |
| `stair/run-too-short` | {thing} has a stretch of its walking line too short for a flight | stretches long enough for a tread, once the landings are taken off |
| `stair/too-few-risers` | {thing} states fewer risers than its flights need | at least two risers on each flight |
| `stair/end-in-no-room` | {thing} starts or ends in no room, so it joins nothing there | each end of its walking line in a room |
| `stair/duplicate-id` | {thing} shares its id with another stair | an id of its own for each stair |
| `pattern/unknown-wall` | {thing} names a wall Grid cannot find | the id of one wall of the plan |
| `pattern/does-not-fit` | {thing} does not fit its wall | room on the wall, between its margins, for every opening of the pattern |
| `pattern/unknown-floor` | {thing} is to be repeated on a floor the plan does not have | a floor of the plan in the pattern's floors |
| `pattern/no-wall-above` | {thing} finds no wall above to repeat on | on each floor it is repeated on, a wall in the same line as its own, holding the opening's whole width |
| `pattern/overlaps-opening` | {thing} would place an opening over another | each opening of the pattern clear of the other openings on its wall |
| `pattern/id-clash` | {thing} would give an opening an id another part has | an id of its own for each opening a pattern places: the pattern's id, the floor and the number |
| `flat/unknown-room` | {thing} names a room the plan does not have | rooms of the plan, by id |
| `flat/room-in-two` | {thing} names a room another flat names too | each room in one flat at most |
| `flat/unknown-type` | {thing} is of a type the plan's flat types do not state | a type stated in the plan's flat types, by id |
| `flat/duplicate-id` | {thing} is listed more than once | an id of its own on every flat |
| `flat/duplicate-type` | The plan states flat type "{id}" more than once | each flat type stated once |
| `flat/zone-without-room` | {thing} names a zone but not the room it is part of | the room a zone is part of, in the flat with it |
| `item/too-large` | {thing} has a number Grid does not accept | finite numbers within the size Grid accepts |
| `item/no-size` | {thing} has no size | a width, a depth and a height above 0 |
| `item/unknown-kind` | {thing} is a kind the plan does not hold yet | a kind Grid holds: a fixture ("toilet", "basin", "shower", "bath" or "kitchen-run"), furniture ("bed", "table", "chair", "sofa" or "storage"), or a kind added through the kinds registry |
| `item/duplicate-id` | {thing} has an id another part of the plan has too | an id of its own on every item |
| `item/unknown-floor` | {thing} is on a floor the plan does not have | a floor of the plan |
| `item/outside-rooms` | {thing} stands in no room | its middle inside a room on its floor |
| `item/into-wall` | {thing} runs into a wall | its footprint clear of the walls, against their faces at most |
| `item/too-tall` | {thing} is taller than the room it stands in | a fixture no higher than its room |
| `item/blocks-doorway` | {thing} stands in front of the doorway of {opening}, an indicator | the floor in front of a doorway clear of fixtures, within Grid's own approach depth |
| `item/blocks-window` | {thing} stands in front of window {window}, higher than its sill, an indicator | a fixture in front of a window no higher than its sill, within Grid's own approach depth |
| `firm/corridor-width` | {thing}: the way through is {width} m wide at its narrowest, under the firm's own figure of {figure} m for corridor width ("{name}") | at least {figure} m: the firm's figure used here ("{name}"), from "{file}", the firm's own and not from any code or standard |
| `firm/door-clear-width` | {thing}: it leaves {width} m clear, under the firm's own figure of {figure} m for clear width of a doorway | at least {figure} m: the firm's figure used here, from "{file}", … |
| `firm/turning-circle` | {thing}: the widest circle its free floor holds is {width} m across, under the firm's own figure of {figure} m for turning circle | at least {figure} m: the firm's figure used here, from "{file}", … |
| `firm/fixture-clearance` | {thing}: the clear floor in front of it is {width} m, under the firm's own figure of {figure} m for clear floor in front of a fixture | at least {figure} m: the firm's figure used here, from "{file}", … |
| `firm/room-area` | {thing}: its net area is {area} m², under the firm's own figure of {figure} m² for room area | at least {figure} m²: the firm's figure used here, from "{file}", … |
| `firm/room-width` | {thing}: the widest circle it holds is {width} m across, under the firm's own figure of {figure} m for room width | at least {figure} m: the firm's figure used here, from "{file}", … |
| `firm/not-read` | The firm's standards in "{file}" were not read, so none of them was set against the plan | a firm's standards file Grid reads: version "1" and a list of standards, as docs/firm-standards.md sets out |
| `floor/unclaimed` | {thing} has enclosed floor that no room claims | every enclosed floor in a room |
| `floor/past-outline` | {thing}'s walls reach past the outline it states | walls inside the outline the floor states, the outside face of the floor |
| `floor/empty-top` | {thing} is the top floor and has nothing drawn on it | a top floor with something on it |
| `floor/out-of-line` | {thing} does not line up with the floor below it | a floor's outline over the floor below it, or marked overhang "meant" where it overhangs or sits back on purpose |
| `floor/rooflight-misplaced` | {thing} has a rooflight that does not lie on one slope of its roof | a rooflight wholly inside the roof and on one of its slopes, clear of the ridge and the hips |
| `floor/dormers-not-drawn` | {thing} lists dormers, which are not supported yet | a roof Grid can draw: dormers are not supported yet |
| `floor/size-question` | {thing} states a height that may not be meant | the height of a storey in a building |
| `floor/spaces-unknown` | The spaces the walls enclose on {thing} could not be worked out | walls Grid can join into spaces |
| `floor/overlaps-unknown` | The rooms on {thing} were not all compared to see whether they overlap | fewer pairs of rooms lying over each other |
| `floor/no-exit` | "{floor}" has no door to the outside | at least one door to the outside |
| `room/no-door` | "{name}" has no door or opening to another space | a door, an opening or an open side to another space |
| `room/no-route-out` | "{name}" has no route to a door to the outside | a route through doors and openings to a door to the outside |
| `room/no-route-to-door-out` | "{name}" has no route to a door to the outside, nor to a door into a space that is not drawn | a route to a door to the outside, or to the door into the space not drawn |
| `opening/to-undrawn-space` | A door from "{name}" leads to a space that is not drawn as a room | a room, or the outside, on the far side |
| `opening/door-out-above-ground` | Where a door from "{name}" leads, {height} m above the ground, was not checked: it is not taken as a way out | a way out at ground level, or a stair down to one |
| `opening/below-ground` | The {window} in "{name}" lies wholly below the ground: its top is {depth} m under the ground level the site states (partly: its sill, threshold or foot) | a door or window above the ground outside, or a light well or an outside stair in front of it |
| `plan/setback-short` | The building is {distance} m from the {east} boundary; you asked for {set-back} m ({set-back} m is assumed for you, to confirm, for one the site marks assumed) | {set-back} m from it, the set-back the person asked for from that edge, the street edges or every edge: their own figure, not a code's |
| `plan/over-boundary` | The building reaches {distance} m over the {east} boundary, out of the plot | the building inside the plot's boundary |
| `room/stair-out-of-line` | The stair "{name}" on "{floor}" does not lie over "{room}" on "{floor}", so it does not join the two floors | the stair room over the one on the floor below |
| `room/lift-out-of-line` | The lift shaft "{name}" on "{floor}" does not lie over "{room}" on "{floor}", so the shaft is out of line | the shaft over the one on the floor below |
| `room/stair-shifted` | The stair "{name}" on "{floor}" is {1.20 m east} of "{room}" on "{floor}" below it: it stands from {(x, y) to (x, y)}, the one below from {(x, y) to (x, y)} | the stair room over the one on the floor below, or marked overhang "meant" where it is moved on purpose |
| `room/lift-shifted` | The lift shaft "{name}" on "{floor}" is {0.60 m north} of "{room}" on "{floor}" below it: it stands from {(x, y) to (x, y)}, the one below from {(x, y) to (x, y)} | the shaft over the one on the floor below, or marked overhang "meant" where it is moved on purpose |
| `opening/too-small-to-pass` | An opening from "{name}" is too small for a person to get through, so it is not a way through | at least {width} m wide or {height} m high, or a sill no more than {sill} m above the floor: Grid's own size for a person to get through, not a code figure |
| `room/too-small` | "{name}" is under {minimum} m² | the figure used here, at least {minimum} m² ({basis}, status {status}); this check's figures were read for {kinds} |
| `room/no-escape-opening` | "{name}" has no window or door to escape through | a window or door to the outside that someone can climb through |
| `room/escape-window-too-small` | The window of "{name}" is too small to escape through | the figures used here, at least {area} m², {width} m wide, {height} m high ({basis}, status {status}); a window someone can climb through when no figure applied; this check's figures were read for {kinds} |
| `room/escape-window-too-high` | The window of "{name}" is too high to escape through | the figure used here, a sill at most {maximum} m above the floor ({basis}, status {status}); a lower sill when no figure applied; this check's figures were read for {kinds} |
| `floor/not-checked-no-stairs` | The way out of "{floor}" was not checked: no stair joins it to the ground floor | a stair joining it, through the floors between, to the ground floor |
| `floor/not-checked-way-out-not-drawn` | The way out of "{floor}" was not checked: its only door out leads to a space that is not drawn | the space beyond its doors drawn as a room, or a door to the outside |
| `floor/not-checked-rooms-not-drawn` | On "{floor}", these rooms could not be drawn, so they and what rests on them were not checked: "{room}", … | rooms that can be drawn |
| `floor/not-checked-doors-not-drawn` | On "{floor}", {this window, these doors, these doors and windows} could not be drawn, so {it, they} and what rests on {it, them} were not checked: "{id}", … | {a window, doors, doors and windows} that can be drawn |
| `floor/not-checked-door-swings` | On "{floor}", {count} doors state no swing, so whether they open clear was not checked: {doors} | the hinge ("start" or "end") and the swing ("left" or "right") of each door that swings or folds; a sliding, pocket, roller or garage door ("kind") needs neither |
| `floor/sketch-drawn-only` | On "{floor}", the sketch is drawn only: {count} sketch items, not measured or checked, and never taken as a wall or a room | nothing: a sketch is for the drawing. A part Grid understands is written as one: a wall, a room, a door, a fixture |
| `floor/not-checked-no-use` | On "{floor}", room sizes were not checked in rooms with no use stated: {count} | a use on every room (bedroom, living, dining and so on) |
| `plan/not-checked-sizes-for-place` | Room sizes were not checked: the figures here are from US model codes, and this plan is for {place} | figures for the place, looked up and given to the check |
| `plan/not-checked-escapes-for-place` | Escape openings were not checked: the figures here are from US model codes, and this plan is for {place} | figures for the place, looked up and given to the check |
| `plan/not-checked-sizes-for-building` | Room sizes were not checked: the figures here were read for homes (houses and flats people live in), and the plan says this is {an office} | figures read for {an office}; the ones here were read for homes (…) |
| `plan/not-checked-escapes-for-building` | Escape openings were not checked: the figures here were read for homes (houses and flats people live in), and the plan says this is {an office} | figures read for {an office}; the ones here were read for homes (…) |
| `floor/not-checked-sizes-for-building` | On "{floor}", room sizes were not checked: the figures here were read for homes (houses and flats people live in), and the plan says this floor is {a shop} | figures read for {a shop}; the ones here were read for homes (…) |
| `floor/not-checked-escapes-for-building` | On "{floor}", escape openings were not checked: the figures here were read for homes (houses and flats people live in), and the plan says this floor is {a shop} | figures read for {a shop}; the ones here were read for homes (…) |
| `floor/not-checked-above-escape-storeys` | On "{floor}", escape openings were not checked in bedrooms: the figures here cover bedrooms up to the third storey: {count} | figures for escape from bedrooms above the third storey, which these checks do not carry |
| `plan/not-checked-access` | What the plan marks as needing to be accessible ({count} rooms and {count} routes) was not checked: Grid holds no figure for it that a named person has confirmed | figures for the widths of doors and corridors, turning space and steps that a named person has confirmed against their source, or the person's own figures in the brief beside the plan |
| `plan/not-checked-no-rooms` | No check that looks at rooms ran: the plan has no rooms | the rooms drawn on the walls, each with the walls round it and its use |
| `plan/read-after-work` | The plan holds work: {existing, demolished and new counts}. Its sizes, areas and checks are for the building as it will be after the work | nothing: the parts to be demolished are drawn dashed and checked as they stand before the work, and grid diff --since phase lists what the work does |
| `plan/value-assumed` | The {value} of {thing} was assumed, not given or measured (or {thing} was assumed, for a whole part) | the person's word on it: this value confirmed, or the right one |
| `plan/mark-no-part` | A mark names {thing}, which the plan does not have, so the mark is not read | a mark on a part the plan has, by its id |
| `room/taped-differs` | {The side along wall "w1"} taped in {thing} is not the length drawn | the drawing within {0.010 m} of the length taped |
| `plan/taped-not-measured` | A length taped in {thing} cannot be set against the drawing: {why} | a taped length that names a room the plan has, and one of its walls or two of its corners, each corner by the two walls that meet there |

### Words Grid does not read

A plan with a field Grid does not know, or a room use it does not know, is still read: without
that field, and with that room's use not stated. Each is a line worth a look, about the part it
is on, with the nearest word Grid knows when one was most likely meant: `thick` on a wall gives
`plan/unknown-field`, whose `found` and `fix` name `thickness` ("Did you mean "thickness"?"). A
use is read whatever its capitals, so `Bedroom` is `bedroom` and gives no line; and a word that
plainly means a use is read as it (CNT-5, `USE_WORDS` in the plan format), so `WC` is `toilet` and
gives no line. No word is read as `bedroom`, `living` or `dining`, the uses the figure checks look
at: `lounge` gives a line that suggests `living`. A plan with no
walls, rooms or openings, `{}` among them, gives `plan/empty`. A field name or a use that breaks
the text rule (MSG-9) is never repeated: the line says it is not. The fields each part has are
read from the format itself (`readingNotes` in `@ongrid/floorplan/types/reading`), so a field
added to the format is never named as unknown.

A code is never reused for another meaning. Until the drawing's checks give their figures as
data, `found` for a problem in the drawing is the check's own sentence, and figures are in it.

## What each check looked at

`coverage` has one entry for each check Grid has (MSG-2), in the order of `checks`, the plan
checks first, then the figure checks, whether it ran or not:

| Field | What it holds |
|---|---|
| `ruleId`, `title` | The check, as in `checks`. |
| `looksAt` | What it looks at: `floor`, `room`, `door` (doors and openings) or `edge`, the edges of the plot's boundary, by number as text (`"1"`, BRF-3), on `floor` `""`. |
| `lookedAt` | The parts it looked at, by floor: `{ floor, ids }`, the ids sorted. |
| `lookedAtCount` | How many parts that is. |
| `skipped` | The parts it did not look at, by floor and reason: `{ floor, ids, reason, why }`. `floor` is `""` for the whole plan. |
| `skippedCount` | How many parts that is. |
| `findings` | How many findings it gave. |
| `readFor` | Only on a figure check that looked at something: the kinds of building its figures were read for, as `["homes"]` (COD-2). |
| `uses`, `buildings` | Only on a figure check: the room uses it looks at, as `["bedroom"]`, and the kinds of building it runs in, as `["home"]` (CNT-5). It runs too where the plan does not say what kind of building it is. |
| `wholeRooms` | Only on a figure check that looked at a room with zones (CNT-8): each such room as `{ floor, room, use, zone }`, the use the check applied to the room as a whole, and the zone it read that use from (`null` for the room's own). |

A check that looks at rooms has every room of the plan under `lookedAt` or under `skipped`,
so a record with no findings says what it is: these parts were looked at and nothing was
found in them. A `reason` is one of:

| Reason | Why |
|---|---|
| `no_place` | no place is stated, so no figure was applied |
| `not_for_building` | the figures were read for homes (houses and flats people live in), and the plan says this is {an office}: the plan, or that floor, is a kind of building the check does not run in (CNT-5) |
| `no_figures_for_place` | no figures for the place the plan is for: the ones here are from US model codes |
| `no_rooms` | no rooms on the floor |
| `cannot_be_drawn` | could not be drawn |
| `waits_for_part` | beside a part that could not be drawn: held until it can be (MSG-5). Its finding is under the floor's `held` |
| `no_stairs` | on a floor Grid cannot follow down to the ground floor |
| `way_out_not_drawn` | the floor's only door out leads to a space that is not drawn |
| `alone_off_ground` | the only room on a floor off the ground, reached by a stair the plan does not draw |
| `above_escape_storeys` | above the third storey, where the figures here stop |
| `no_ground_level` | the plan states no ground level for the site (LVL-4: the check of doors and windows below the ground) |
| `no_building_outline` | the building has no outline to measure from (BRF-3: the distances to the plot's boundary) |
| `boundary_not_closed` | the boundary is not one closed shape (BRF-3) |
| `no_use` | no use stated |
| `use_not_covered` | the check is not about rooms of its use: only bedrooms are checked for escape, and only bedrooms, living and dining rooms for size |
| `part_of_room` | a zone (CNT-8), looked at as part of its room, with its use: the size and escape checks and the route checks look at the room as a whole |

Every reason but `use_not_covered` and `part_of_room` is something the check could not look at. Where a whole
floor or plan was skipped for one of those, a `not-checked` line says so too; `coverage` holds
the rest, room by room. `grid check` prints the count of rooms looked at by at least one check
beside the count of lines, then each check with what it looked at and skipped; `grid_check`
returns `coverage` and says the same counts in its text.

## Numbers and their state

Every area Grid gives carries a state (MSG-2, lab AA-12, AC-9), one of:

- `proven`: every room it is made of was measured, and nothing in the drawing questions them.
  A sum of no rooms is 0, and proven.
- `not-proven`: a room it should hold could not be measured, or the drawing questions a room's
  outline (`room/not-enclosed`, `room/space-mismatch`, `room/overlap`, `room/overlap-unknown`,
  `room/inside-no-host`, `room/zone-not-in-room`). It names those rooms.
- `not-looked-at`: nothing it would be made of could be measured. A room that cannot be drawn
  has no area (`net: null`), never 0.

`grid_areas` gives each room its `state` and `doubts` (the codes above), and `states` for each
figure of each floor (`net`, `byUse`, `circulation`, `grossInternal`, `grossExternal`) and for
each total (`net`, `circulation`, `grossInternal`, `grossExternal`, `circulationShare`,
`netToGross`). Each holds `state`, `leftOut` and `notProven`, the rooms as `{ floor, id, name }`.
A total that left a room out names it, in `leftOut`, in its text ("not proven: leaves out
"Kitchen", which could not be measured") and in a note. The CSV has a `state` column.

## The place

The figure checks apply figures from building codes, and a figure holds only where its code
does (COD-3). The plan states where it will be built in `site.country`
([plan-file.md](plan-file.md#the-place)); `grid check --country` and `grid_check`'s `country`
name another for one check, and that one is used. A place is a country's name or its two- or
three-letter code (ISO 3166-1) on Grid's list (`packages/floorplan/src/types/places.ts`), in any
case, with spaces round it: `US`, `usa`, ` United States ` and `U.S.A.` are one place. Anything
else is refused, by the argument or the field and never by the text: `the moon` given as
`country` is refused (exit code 2 from `grid check`, an error result from the tool), and in a
plan file it is left out with a `plan/value-left-out` line at `site.country`, the rest of the
site kept. Every word a report says about the place is Grid's own name for it, from the list.

- **The US.** The figure checks run on the figures carried here, from US model codes.
- **Another place.** No carried figure is applied; a check runs on figures looked up for the
  place, and `plan/not-checked-sizes-for-place` and `plan/not-checked-escapes-for-place` say
  which did not run, naming the place from the list.
- **No place stated.** No figure is applied (lab W-12): neither figure check runs, `place` is
  `null`, and `withoutPlace.usLines` counts the lines the US figures would have given. Their
  `coverage` skips every room with the reason `no_place`. No line is added for it, so the short
  report of a small plan still fits (see below); the first line after the label says it.
  `withoutPlace: "us-figures"` (or `WITHOUT_PLACE` in `packages/rules/src/checks/place.ts`)
  applies the US figures to a plan that states no place, as before COD-3, with `place.from`
  `assumed`.

- **The place and the kind of building.** A figure applies only where both hold: the place is
  one Grid carries figures for, and the building (or its floor) is a kind they were read for, or
  the plan does not say (CNT-5). Each says so its own way: the place in the line after the
  label and in `place`, the kind of building in its own `not-checked` lines
  (`plan/not-checked-sizes-for-building`, …) and the coverage reason `not_for_building`. The US
  stated for an office gives "Place: United States, from the plan; no figure was applied: its
  figures were read for homes, and the plan says this is an office." and the two
  `…-for-building` lines; no place stated for an office gives the no-place line and the same two.

The first line of every report after the label says the place and the figures applied:
"Place: United States, from the plan; figures from US model codes, read for homes." ("from
--country" in `grid check`, "from the country argument" in `grid_check`), or "Place: Spain, from
the plan; Grid carries no figures for it, so none was applied.", or with no place "No place is
stated, so no figure was applied: the US figures would have given 2 lines. State it in the plan
as site.country, or give --country."

## Taped against drawn

A plan may keep the lengths taped on site in `taped` (HND-11, lab WR-14;
[plan-file.md](plan-file.md#lengths-taped-on-site)). Every run sets each one against the drawing:
`grid check` and `grid_check` print the table after the notes, and the answer of every change to
the plan (the edit tools, `grid edit`, `grid_write_rooms`, `grid write`) prints it too, at most 12
rows, the ones that differ first. A row in `taped` (the record's, and `taped` in `grid_check`'s
and every change's receipt, empty there for a plan that keeps none) holds:

| Field | What it holds |
|---|---|
| `index` | Its place in the plan's `taped` list, from 0 |
| `id` | The plan's id for it, or null |
| `room`, `roomName`, `floor` | The room it was taped in, its name and its floor |
| `what` | `side` (along one wall) or `corners` (corner to corner) |
| `walls` | The side's wall, or the four walls that name its two corners |
| `taped` | The length taped, in metres |
| `drawn` | The same length on the drawing's inside faces, or null when it cannot be measured |
| `off` | Drawn less taped, positive when the drawing is longer; null with no drawn length |
| `within` | How far apart they may be and agree: the taped length's own `tolerance`, else `tapedAgree` (0.01 m) |
| `state` | `agrees`, `differs` or `not-measured` |
| `missing`, `missingWalls` | Only when not measured: `bad-length`, `no-room`, `no-wall`, `not-the-rooms`, `no-corner` or `not-drawn`, and the walls it is about |

A row that differs is also a line, `room/taped-differs`, and one that cannot be measured is
`plan/taped-not-measured`; both are worth a look. A row that agrees is no line.

## The firm's own standards

A firm keeps its own figures, such as corridors at least 1.5 m, in `firm-standards.json` beside
the plan ([firm-standards.md](firm-standards.md)). `grid check` and `grid_check` read it, measure
the plan for each standard by the same measures as the use indicators (CNT-13) and the net area
(ARE-9), and give a line for each part short of the firm's figure (COD-8):

- **A finding with a `firm/` code**, after the code figures' findings and before what was not
  checked. It counts in `count`, `counts.finding` and `problems`, as every finding does. Its
  `needed` is "the firm's figure used here", from the file, "the firm's own and not from any code
  or standard"; its `firm` holds that figure. It never has `figures`, and the firm's figures are
  never in the record's `figures`, `checks` or `basis`.
- **Under its own heading.** Every report sets the firm's lines under "The firm's own standards
  (N), from "firm-standards.json": the firm's own figures, from its file beside the plan: not
  from any code or standard, and not tied to a place, so they are set against the plan wherever
  that file is." The count says how many findings are the firm's ("2 findings of the firm's
  own"; "3 findings, 2 of them the firm's own"). With no other finding, "No findings outside the
  firm's own standards." A file whose standards gave no note is one line that says it was read.
  The full report lists each standard: "the firm's figure used here is at least 1.5 m", the
  parts it was set against and how many are short of it.
- **Not tied to a place.** The firm's figures are set against the plan whatever place it states,
  or none (COD-3): with no place, the code figures are not applied and the firm's still are.
- **A file Grid cannot read** is one `firm/not-read` line, `not-checked`, about the plan, whose
  `found` says where the file is wrong and never repeats its text; the record's `firm.read` is
  `false`. The plan is checked as without the file. A file that is a link out of the project is
  refused as the seen marks beside the plan are.
- **No file, no change**: a plan with no firm's file gives the record and the reports as before.

## The short report, and seen notes

`grid check` and `grid_check` print a short report by default, sized to the plan (MSG-10): the
label first, then the place (COD-3); the lines, each with what was found and needed and the fix; the figures those
lines used, each as the figure used here with its document, edition, clause and status; what
each check looked at, in counts (the rooms looked at by at least one check, each check's count,
and the parts it could not look at, with the reason); and one line on what the whole report
adds. A check that looked at nothing still says "Nothing was checked for …". `grid check --full`
and `grid_check` with `full: true` add the checks run, every figure the checks applied, each
check's parts one by one, and what these checks never look at (`limits`). The data is the same
either way: `grid check --json` gives the whole check, and `grid_check`'s data keeps `coverage`
and `limits`. For the lab's 62.65 m² flat, which states no place, the short text is 1,196 bytes
from `grid check` and 1,179 from `grid_check`, 984 and 969 without the line saying the plan
states no ground level (LVL-4); with the US stated it is 1,200 from `grid check`, 988 without
that line (`packages/cli/src/command/__tests__/shortReport.test.ts`). The figure checks that did
not run because no place is stated are said together in one line of the counts, and when every
check that used figures read them for one kind of building, the place line says it.

A person can set a note aside as seen, with a reason and the name or role they give, through
`grid check --seen <n> --reason <text> --by <name>` or `grid_mark_seen`. A seen note is never left
out and never called dealt with: it is listed under "Seen", with its reason, who marked it and
the day, and the count of lines says how many are seen. The mark is keyed to the note (its
`code`, `thing` and `also`) and to the content of the parts it is about: the thing and the
`also` ids, a room with the walls of its outline, an opening with its wall, a floor with
everything on it, and the whole plan for a line about the plan that names no part. When one of
them changes, the mark no longer holds and the line is listed with the others again, saying it
was seen before and which part changed since. A line for several rooms (`each`, MSG-5) is one
note: its thing is the first room and `also` names the others, so the mark holds every room with
its outline. A mark made on one of those rooms' notes, or on the line when it named other rooms,
finds the line but never holds: the line is back, naming the rooms that joined or left. Marking
or unmarking the line replaces such a mark.

A part's content holds the plan's own `marks` that name it ([where a value came
from](plan-file.md#where-a-value-came-from), WRT-6), so a change to one brings its note back.
A seen mark is not one of those marks: they are in the plan, and seen marks only beside it. A
part can have several notes of one code, one for each value the plan marks assumed
(`plan/value-assumed`); a seen mark made while its note shared its `code`, `thing` and `also`
with another keeps the note's `message` as well, and holds only for that note. A mark without
one holds no more once another note joins its own, and the notes are listed as new.

The marks are kept beside the plan, in `<plan>.seen.json` (`plan.seen.json` beside
`plan.json`), read and written only through the project's resolver. No export, sheet or drawing
reads them. A file that is there and cannot be read is said in the report, every note is then
listed as new, and no mark is written over it.

```json
{
  "version": "1",
  "marks": [
    {
      "code": "room/too-small",
      "thing": { "kind": "room", "id": "bed2" },
      "also": [],
      "parts": [{ "kind": "room", "id": "bed2", "hash": "…" }, { "kind": "wall", "id": "w3", "hash": "…" }],
      "reason": "A box room, kept small on purpose",
      "by": "Owner",
      "at": "2026-11-22T10:00:00.000Z"
    }
  ]
}
```

In `grid_check`'s data, a line with a mark carries `seen`: `{ state, reason, by, at }`, `state`
`seen` while the mark holds, and `back`, with `changed` (each part as `{ kind, id }`), when one
of its parts changed since. `seenCount` is how many lines are seen, `marksFile` the marks file
in the project, and `marksProblem` why it could not be read, or null. `grid check --json` gives
the same as `seen` (`file`, `problem`, and `states`, one per line of `result.lines`) once a line
has a mark or the marks file cannot be read, and `marked` after `--seen` or `--unseen`; a plan
no one has marked gives the same JSON as before.

## Refusals

A plan is refused when it is not JSON, not a JSON object, holds an unfinished git merge, or
does not fit the plan format at its top level (a version Grid does not read, a list of parts
that is not a list).

A fault inside a part refuses nothing (MSG-6). The plan is read part by part, with the
format's own rules, and each wall, room, opening, floor and fixture that cannot be read as
written gets a line by its id (or, with no id that can be read, its place) and its place in
the file:

- `plan/read-as-meant` (`worth-a-look`): a number written as text (`"2.5"`, `"0.9 m"`),
  `"true"` for true, a word that differs from one the format knows only in its capitals or
  spaces (`"Exterior"`), a whole number where an id goes. It is read as meant.
- `plan/value-left-out` (`worth-a-look`): a value the format cannot read in a field the part can
  do without. The field's default is used, or the field is read as not stated; the line says
  which. A unit other than metres is read so: every length is read in metres.
- `plan/part-left-out` (`left-out`): a value the part cannot do without that cannot be read. The
  part is left out of every view, measure and export, and a room or opening that rests on a wall
  left out is left out with it (`room/broken-wall`, `opening/broken-wall`, naming the wall).
- `NaN`, `Infinity` and a number with a decimal comma inside an object (`"offset": 3,45`) are
  not JSON. They are read as a value that is not there, at their place, and the line names
  them for what they are. A comma inside a list is JSON, so `[4,6,3,3]` for a point is read as
  four numbers, and the line says a decimal comma most likely split them.
- Ids are unique across the whole plan. A blank id (`plan/blank-id`) and an id that differs
  from an earlier one only in capitals or spaces (`plan/similar-id`) leave the part out; the
  earlier keeps its id, in the order walls, rooms, openings. Of two parts with one id, only the
  clash is left out (`plan/id-clash`): a wall keeps its id, since rooms and openings name walls,
  and otherwise the first in the order walls, rooms, openings, fixtures does. Two walls with one id are both left out (`plan/duplicate-id`): a room that
  names it could mean either. The lines name both parts, and `plan/id-clash` and
  `plan/duplicate-id` an id to rename one to.

- In the record: `read: false`, and one `refused` line for each place the format refuses,
  with the part it is in when its id can be read, the place (`walls[2].thickness`) and what
  the format wants there. A refusal never repeats the text it found: that text is someone
  else's.
- `grid` commands: exit code 1 and one line on standard error that starts `grid: `. A wrong
  command line is exit code 2.
- The tool server: a refusal is a tool result marked as an error (`isError: true`) with one
  line of text. That holds for every tool and every reason: arguments that are not an object,
  an argument the tool does not take, a value out of range, a plan that is not there, a plan
  the format refuses, a change that would break the drawing. JSON-RPC errors are kept for a
  request that is malformed: text that is not JSON (-32700), JSON that is not a request
  (-32600), a method the server does not have (-32601), a tool the server does not have and
  bad parameters to the protocol itself (-32602), and a protocol version Grid does not speak
  (-32022). `packages/cli/src/mcp/__tests__/contract.test.ts` holds the server to this.

## Receipts

What a tool that writes or changes something returns when it has done it. Each also returns
its text, which says the same.

| Tool | Receipt (`structuredContent`) |
|---|---|
| `grid_export` | `written` (the file, inside the project), `format`, `leftOut` (how many parts of the plan the file leaves out), `leftOutParts` (each of them: `kind` `wall`, `room`, `opening`, `item` or `floor`; `id`, null when the reader could not read one; `place` in the plan file, `openings[4]`, for a part left out when the plan was read, else null; `floor`, null when not known; `code`, the line that leaves it out, as `grid_check` gives it, or null), `note`, `dxfProfile` (HND-1: for a DXF, the project's profile file its layers and pens came from, `dxf-layers.json`; null for Grid's own layers and for the other formats). An export that would hold no wall, room or fixture is refused, and so is a DXF whose project profile is wrong. |
| `grid_sheet` | `written`, `layout`, `pages` (kind, title, floor), `leftOut`, `note`. |
| `grid_preview` | `floor`, `view`, `room` (the room framed), `note`, `highlight`, `selected`, `camera`, `revision`, `planFile`, `previewFile` (the record beside the plan, inside the project) and `shown` (false when it only read the selection and wrote nothing). It never writes the plan ([The preview, shared with the person](tool-server.md#the-preview-shared-with-the-person)). |
| `grid_mark_seen` | `written` (the marks file, inside the project), `line` and `code` (the note marked), `unmarked` (true when a mark was taken off), `mark` (`reason`, `by`, `at` and `parts`, each `{ kind, id }`; null when `unmark` found none). It never writes the plan. |
| `grid_write_brief` | `written` (the brief file, inside the project; null when `brief` was left out and nothing was written), `file` (the brief file), `planDrawn` (false before the plan is written), `problem` (why the brief there can't be read, or null) and `lines`, each line of the brief as below. It never writes the plan. |
| `grid_change_opening`, `grid_move_room_side`, `grid_mirror`, `grid_merge_rooms`, `grid_split_room`, `grid_add_room`, `grid_stretch`, `grid_rename_room`, `grid_square_scan` | `written` (the plan's path in the project, never the full path), `changed` (each change in words), `verdict` (the plan before and after), `drawingProblems` and `toLookAt` (the record's `count`), each `before` and `after`, `doors` (each door that now joins other rooms), `guessed` (what the request left open and Grid chose), `couldNotKeep` (what the change could not keep as it was), `brief` (`file`, `problem`, `lines`: the brief beside the plan against the plan as changed) and `taped` (each length taped on site against the plan as changed, as in "Taped against drawn"; empty when it keeps none, HND-11). `grid_rename_room` adds `checks`: the ids of the figure rules that now look at the room (`now`) and no longer do (`noLonger`). `grid_square_scan` adds `moves` (each wall it moved: `wall`, `turned` in degrees, anticlockwise positive, and `moved`, how far its farther end moved, in metres) and `leftAsTheyAre` (the walls too far off square to turn). `grid_write_rooms` adds `brief` and `taped` too, `reminder`: one line on a first plan with no brief beside it, else null, and `layout`: null, or for a first layout from the brief (BRF-6) its `shape`, `rooms` (the rooms text written), `outline`, `added`, `notKept` (each `room`, `name`, `text`, `by`), `notPlaced` and `touch` ([brief.md](brief.md#a-first-layout-from-the-brief)), and `scan`: null, or for a phone room scan (HND-12) its `evidence`, `paired`, `oneSided`, `areas`, `assumed`, `leftOut` and `match` ([commands.md](commands.md#a-plan-from-a-phone-room-scan-grid-write---scan)). |

A line of the brief (BRF-1, [brief.md](brief.md)) has a `state` (`met`, `missed`, `open`, or
`differs` for a size in a room's name), `wish` (`room`, `rooms`, `footprint`, `touch`, a figure's
name, `open` or `name`), `level` (`must`, `should`, `avoid`; null for a name), `source`
(`given`, `assumed`; null for a name), `quote`, `asked` and `drawn` (as text, `"4.5"`, `"11.93"`;
null when there is none), `unit`, `parts` (each `{ kind, id }`) and `text`. A line met says only
that the drawing holds what was asked; no line is a score, and none says a plan is allowed.

A change that would add a problem that leaves a part out is refused, and nothing is written.

## What may change

- Codes, field names and kinds stay as they are within `resultVersion` 1. A new code, a new
  field or a new kind of thing may be added: read a line by its `code`, and treat a code you
  do not know as worth a look.
- A wording may be improved. It changes in one place and is listed below. Match on `code`,
  never on `message`.
- `found`, `needed` and `fix` may say more as the checks give their figures as data.
- The order of lines within a kind follows the checks and may change.
- A code that changes meaning, or a field taken away, raises `resultVersion`.

## Changelog for agents

### 2026-11-22: kinds of door and window, their handing and the part that opens (CNT-14)

- A door or window may state its `kind` and the part of it that opens (`opens`); see
  [Kinds of door and window](plan-file.md#kinds-of-door-and-window-their-handing-and-the-part-that-opens).
  A door with no kind is one swinging leaf, as before; nothing changes for a plan that states none.
- The door-swing check knows the kinds: a pair sweeps a quarter disc from each jamb, a folding
  door a strip one panel deep, and a sliding, pocket, roller or garage door sweeps nothing, so it
  is never `opening/door-blocked`, `opening/door-hits-item` or `opening/doors-collide`, and needs
  no swing. A pair needs only its `swing`: `opening/hinge-without-swing` is given for a pair that
  states a hinge and no swing, never `opening/swing-without-hinge`.
- New code, not checked: `floor/not-checked-door-swings`, one line per floor naming the doors
  (in `also`) whose kind swings or folds and that state neither `hinge` nor `swing`. Before, they
  were left out in silence. It follows from nothing and is no problem (`problems`).
- New codes, worth a look: `opening/wide-single-leaf` (a door 1.5 m wide or more, `wideSingleLeaf`,
  that states no kind; on a plan that may not be in metres it follows from `plan/units-question`),
  `opening/kind-not-for-type` (a kind its type does not take, read as no kind) and
  `opening/part-too-large` (a part that opens larger than the opening, or on a fixed window or a
  doorless opening, read as the whole opening). They are door warnings in the drawing too.
- The escape check measures a window by the part that opens when the plan states one, and a
  `fixed` window as opening nothing. The limit it states now reads "Windows are measured by the
  part that opens where the plan states it, else as drawn: the part that opens may be smaller".
- `grid_change_opening` takes `kind`, `hinged` (`left` or `right`, as seen from a room) and
  `seen_from` (a room id or `outside`; the room it opens into when left out). `grid_write_rooms`
  reads a kind word, `hinged left|right [seen from <room>]` and `part <w> [x <h>]` on a door or
  window line, and `grid_describe as=rooms` writes them back.
- `grid_schedule`: grouped, a row has `kind` (null when not stated) and each kind and size is a
  row of its own, `2 × sliding door …`; the CSV adds a `kind` column only when some opening
  states one. With `of=openings`, each row has `kind`, `opens` (`width`, `height`, or null) and
  `handing` (`opens into "Hall", hinged on the left`, or null), in the text too; the CSV adds
  `kind`, `opens width m`, `opens height m` and `handing` columns only when some row has one.
- The 3D files (OBJ, GLB) hold each door's and window's `frame_`, `leaf_` and `glass_` objects,
  the glass in a material of its own; the IFC fills each door and window with its frame, leaves
  and glass (the glass styled), and types it by kind (`door:sliding:2.2x2.1`, IFC operation
  `DOUBLE_DOOR_SLIDING`, `ROLLINGUP`, …). A door's leaves hang closed from the face of the wall it
  opens toward.
- `grid_diff` names a door or window of another kind (`now sliding (was double)`) and another part
  that opens (`part that opens the whole of it → 0.5 m`) among its change lines.
- A door or window pattern (LVL-8) carries its opening's `kind` and `opens`, with its `hinge` and
  `swing`, into every opening it makes.
- In the DXF (with HND-1's blocks), a door or window of a kind other than one leaf, or one that
  states its part, is a block of its own named with its kind (`GRID-DOOR-SLIDING-2400x200`), and
  what its symbol shows above the cut or hidden in the wall is dashed on `GRID-OPENINGS-ABOVE`
  (the profile's category `openings-above`), a layer listed only when something is drawn on it.
- With MSG-11, CNT-14's four codes are said in every language Grid writes, from the message
  files like every other code: `opening/wide-single-leaf`'s `values` hold `wide` (1.5, in metres)
  and `floor/not-checked-door-swings`' hold `count` (the doors are in `also`). The sheet's
  schedule of doors and windows names each kind (`puerta corredera`) and says the part that opens
  and a door's handing in the sheet's language; `grid_schedule`'s `handing` stays English, as the
  other measures do.
- With CNT-18, a door or window of any kind may stand on a curved wall: it is drawn, checked
  and swept from its straight hole (the chord between its edges), and its frame, leaves and glass
  stand square to that chord in 3D, the OBJ, the GLB and the IFC. A handing said in rooms
  (`opens_into`, `hinged`) reads the curve's faces as it reads a straight wall's.

### 2026-11-22: a curved wall (CNT-18)

- A wall may state `arc`: `{ centre: [x, y], sweep }`, the angle in degrees it turns through
  round `centre` from `start` to `end` (counter-clockwise positive; 360 is a whole circle, its
  `start` and `end` one point). Offsets, widths and lengths along it are along the curve, and an
  opening's hole is the straight chord between its edges. Every figure (areas, lengths, routes,
  facing) follows the curve; a plan with no curved wall answers exactly as before.
- New codes, errors about a wall (`thing.kind` `wall`), which leave the wall out of every view,
  measure and export: `wall/arc-ends-apart`, its end is not on the circle where the sweep takes
  its start (further than `arcEnds`, 5 mm), and `wall/arc-too-tight`, its radius is no more than
  half its thickness. An `arc` the reader cannot read (no centre, a sweep of 0) is read as not
  stated, as a hinge is (`plan/value-left-out`), and the wall is drawn straight.
- `grid_export` adds `approximated`: each curved wall, and each room along one, that the file
  writes with its curve as straight pieces, as `{ kind: "wall" | "room", id, floor }`, and a
  line in its text that says so. The DXF writes a curved wall's faces as true arcs and names only
  the rooms; the IFC writes its axis as a true arc and names the walls and the rooms; the OBJ and
  the GLB name both. The file says it too, beside what it leaves out: `Grid_Approximated` in an
  IFC, the left-out layer in a DXF (`GRID-LEFT-OUT`, or the profile's), comment lines in an OBJ,
  `asset.extras.gridApproximated` in a GLB. In the DXF a curved wall's outline and its fill (HND-1's
  hatch) have their faces as true arcs, on HND-1's wall layers and pens. A plan with no curved wall gets none of it, and its files are as they were.
- `grid_describe` gives a curved wall's centre and sweep (`arc(5,5 360°)` for an agent, "curving
  360° anticlockwise round 5, 5 (radius 3, 18.85 along the curve)" for a person). Read back as
  rooms text, a floor with a curved wall is given in Grid's own terms (`raw` lines), which keep
  the curve.
- The edits that move, cut or measure from a side of a room refuse a curved wall, naming it
  (`isError: true`): rooms text and the room edits draw straight walls. `grid_change_opening`
  changes an opening on a curved wall along the curve, measured from its start or its end;
  `grid_mirror` mirrors a curved wall's centre and turns its sweep the other way.
  `grid_square_scan` leaves a curved wall as it is, says so among what it guessed, and refuses to
  square a wall whose end meets one.
- The IFC's base quantities (HND-2) measure a curved wall along its curve: `Length` is its length
  along the arc, `GrossFootprintArea` and the volumes its body by the straight pieces.
- With VEW-9, CNT-10 and VEW-4: `grid_measure what=route` and `grid_describe length=walk` walk
  through a door in a curved wall square to its straight hole, and cross a curved dividing line
  at the middle, along the curve, of the stretch the two rooms share; `grid_takeoff for=change`
  measures a curved wall to be demolished or new along its curve, and a whole circle has no ends
  to make good; a click on the preview's 3D picture meets a curved wall along its curve. A curved
  wall in a plan with phases is drawn and exported on its phase's layer, with its arc.
- With MSG-11: `wall/arc-ends-apart` and `wall/arc-too-tight` are said in every language, as
  the other wall codes are; `grid_describe` gives a curved wall in the language asked
  for ("en curva de 180° en sentido antihorario…"). The refusals of an edit on a curved wall, the
  export's line on its approximations and the files' notes stay English, from keys of the message
  files, as the other edits' and exports' words do.

### 2026-11-22: every language, starting with Spanish (MSG-11)

- `inspectPlan(raw, { language })`, `grid check --lang`, and a `language` argument on `grid_check`,
  `grid_describe`, `grid_view` and `grid_sheet`: `en` (the default) or `es`. Left out, the plan's
  own `display.language`. The codes, kinds, things, ids, figures, `fixes` and `values` are the
  same in every language; the `label`, each line's `message`, `found`, `needed` and `fix`, the
  checks' titles, the coverage reasons and the limits are said in the language. A Spanish record
  writes figures with a decimal comma unless the plan's `display.decimal` says otherwise.
- The record has `language` when it is not English. Each line has `values` when its words name a
  figure, a name, an id or a place: the values its wording was made with, by the names the
  wording gives them (`{width}` is `width`), a figure as a number rounded as the words give it.
- A room's use may be written by its label in any language Grid writes: `dormitorio` is
  `bedroom`, and is checked as one. A room's name is never translated.
- The Spanish words are a draft translation, not reviewed by a person yet. Retell from the codes
  and values when in doubt; the label is "Orientación general, no sus normas locales".
- No line in Spanish uses cumple, aprobado, conforme, homologado, certificado, válido, autorizado
  or their kin (`approvalWords`).
- The codes the same day's MSG-5, COD-3, CNT-8, LVL-6 and LVL-8 add (`plan/no-walls`,
  `opening/above-roof`, `room/zone-not-in-room`, `floor/rooflight-misplaced`,
  `floor/dormers-not-drawn`, and the six `pattern/…` codes) are said in every language too, and so
  is a facade's caption. A line for several rooms (MSG-5) has its own wording for many in each language
  (`check.<wording>.many`), the same English as before. So are BRF-3's: the plot check's title,
  limit and skip reasons, `plan/setback-short`, `plan/over-boundary`, `plan/boundary-crosses`,
  `plan/not-checked-boundary` and `plan/site-things-drawn-only`, the boundary's edges by name
  (`the east boundary` is `la linde este`), and `grid describe`'s lines on the plot. Their lines'
  `values` hold `edge`, `distance`, `past` and `asked`.
- CNT-17's `plan/not-checked-access` is said in every language too (its counts of rooms and
  routes by key), and LVL-9's section picture in `grid_view` (`kind=section`) and `grid draw
  --section` takes the language: its title, level names, heights and list of what Grid took. The
  section's data keeps `assumed[].words` in English, as the tool's text; `grid_measure
  what=access` answers in English, as the other measures do.
- COD-8's `firm/` lines are said in every language too: their message, found, needed and fix,
  the heading "The firm's own standards" over them in `grid check` and `grid_check`'s text
  (`Las normas propias del estudio`), the counts and the full report's list of the standards.
  Their `values` hold `figure`, `measured` and `file`; the record's `firm.heading` stays the
  English heading, as data. Where a part was measured (`found`) is said by key too; why a firm's
  file was not read (`firm/not-read`'s found) keeps the reader's English.
- HND-11's `room/taped-differs` and `plan/taped-not-measured` are said in every language too,
  and so are `plan/far-from-origin`'s new words (the site's origin it measures from) and the
  "Taped against drawn" table in `grid check` and `grid_check`'s text (`Con cinta frente al
  dibujo`). Their lines' `values` hold `taped`, `drawn`, `off` and `within`, in metres; the
  record's `taped` rows are data and the same in every language. The table in every change's
  answer stays English, as the rest of that answer.
- CNT-10's `plan/read-after-work`, `opening/phase-wall` and `room/phase-wall` are said in every
  language too, and so are the drawing key's phases (`Muro existente`, `Muro nuevo`, `A demoler`)
  and `grid_describe`'s sentence on the work. `plan/read-after-work`'s `values` hold `existing`,
  `demolished` and `new` (counts of walls, openings and rooms together) and `base`. VEW-9's walk
  (`grid_describe length=walk`, for a person) takes the language, its pictures named in it
  (`imagen 1`); the agent's form of the walk stays as it is. WRT-7's sheet in the person's units
  takes the language too: Spanish words, the display's units, and the language's decimal mark
  unless the display states one. `grid_measure what=route`, `grid_takeoff for=change` and the
  preview answer in English, as the other measures and tools do.
- BRF-4's `floor/past-outline` is said in every language too, and so is a floor outline too far
  from the origin to join. HND-12's scan notes and refusals (`grid write --scan`, `grid_write_rooms
  scan`) and BRF-4's site limits (`grid_measure what=site`) answer in English, as rooms text and
  the other measures do.
- CNT-4's six `flat/` codes are said in every language too, a flat is named by key (`Vivienda
  "A"`), and so are the sheet's flat schedule and its mix by type (`Cuadro de viviendas`, its areas
  with the language's decimal mark). `grid_areas`' and `grid_schedule of=flats`' answers stay
  English, as the other measures do.
- LVL-5's `wall/through-floor`, `floor/out-of-line`, `room/stair-shifted` and `room/lift-shifted`
  are said in every language too, and so are `floor/not-checked-doors-not-drawn`'s wordings by
  the openings' type (`esta ventana`, `estas puertas`) and `room/cross-floor`'s new `needed` and
  `fix`. A shifted stair's or shaft's lines have `values` `ways` (east or north, in metres) or
  `sideWays` (its sides, for a shaft not moved as a whole); the finding's `shift` is data and the
  same in every language. A coordinate pair in Spanish is written `(1,20; 0,00)`.
- BRF-6's first layout (`grid_write_rooms layout`, `grid write --layout`) and the alignment offered
  for a door between rooms that share no wall answer in English, as rooms text does.

### 2026-11-22: a first layout from the brief, and a door's alignment (BRF-6)

- `grid_write_rooms` takes `layout` (`tidy` or `sizes`) in place of `rooms`, which is no longer
  required: one of three, with HND-12's `scan`. A call with none of them, or more than one, is
  refused naming them (`Pass layout or scan, not both.` for those two). It writes a first layout
  of the brief beside the plan as rooms text, refused when there is no brief, it can't be read, or
  it holds no room with a size. Its receipt adds `layout`: null when rooms text or a scan was
  passed (and a layout's receipt carries `scan: null`); else `shape`, `rooms` (the rooms
  text written, to change and send back), `outline` (east-west by north-south, m), `added` (the
  hall Grid added, by name, or null), `notKept` (each size not kept: `room`, `name`, `text`, the
  brief's own line for it with how much its area changed, and `by`, that change in m²),
  `notPlaced` (each room of the brief not placed, with why) and `touch` (`wished`, `held`). The
  text adds the same, then the rooms text. `grid write --layout tidy|sizes` does the same, and its
  `--json` adds `layout`; it refuses `--layout` with a rooms file or with `--scan`.
- A door between two rooms that share no wall (`rooms/no-shared-wall`) is refused, when one
  room's other alignment would make them share one, with `With line 3 written '…', they share a
  wall.` at the end of the message. The core's `compileRoomsText` gives the same as data on the
  problem: `fixes`, each `{ line, text }`. A refusal of the tool stays text, as every refusal is.
- A wall height the rooms text does not state is no longer written into the plan file as Grid's
  default with an `unstated` beside it, which the check then named as a field it does not know;
  the reading fills it, as for any wall written without one.
- No new code in the record.

### 2026-11-22: walls through floors, and floors that line up (LVL-5)

- The plan format takes a wall's `through` (C19): the highest floor it rises through. A room on
  any floor it stands on may list it, so `room/cross-floor` is no longer given for such a wall.
  An opening in it may reach as high as the wall rises, measured from the wall's own floor, so
  `opening/too-tall` compares with that height; openings one over the other in it are not
  `opening/overlap`. `plan/unknown-field`'s list of a wall's fields now names `through` after
  `floor`.
- A floor and a room take `overhang: "meant"`: the floor's outline, or the stair room or lift
  shaft, does not line up with the floor below on purpose.
- New codes: `wall/through-floor` (`worth-a-look`): `through` names a floor the plan does not have
  or one not above the wall's own, and the wall stands on its own floor only.
  `floor/out-of-line` (`worth-a-look`): a floor's outline reaches past the floor below, or sits back
  from it, by more than `stackShift` (0.05 m); its message names the side, how far and the box of
  each stretch, up to three, then how many more. `room/stair-shifted` and `room/lift-shifted`
  (`finding`, under the check `stairs-line-up`): a stair room or lift shaft that joins the one below
  but is moved from it; the finding carries `shift` (`east`, `north`, in metres, `sides` for a shaft
  not moved as a whole, and the `upper` and `lower` boxes), and its message says which way, how far
  and where both stand. None is given for a floor or room marked `overhang: "meant"`.
- Wording changed: `floor/not-checked-doors-not-drawn` names its openings by their type ("this
  window could not be drawn, so it and what rests on it were not checked: …", "these doors and
  windows …"), and so do its `found`, `needed` and `fix`; the notice carries `openingKinds`. It no
  longer calls a window "doors or windows" (lab A-16). `room/cross-floor`'s `needed` and `fix`
  mention a wall that rises through floors.
- With VEW-4 and CNT-10: `grid_preview`'s `parts` list a wall through floors, and an opening in
  it, on each floor it is drawn on, and a click on the 3D picture meets the wall up to its whole
  rise; `grid_takeoff for=change` takes a wall through floors off once, whole, its height its whole
  rise, and `floors` takes it in when it stands on any floor named.
- With BRF-4: a floor that states an outline and has a wall rising through it from below is not
  massing, so `grid_check` gives its `floor/unclaimed`, as `grid_areas` measures it.
- `resultVersion` stays 1.

### 2026-11-22: flats, flat types and the mix (CNT-4)

- The plan format takes `flatTypes` (each `id` and `name`) and `flats` (each `id`, `name`,
  `type`, `rooms` by id, at least one, on one floor or several, and `mirrored`), C18. Both are
  optional and never defaulted; `plan/unknown-field`'s list of the plan's fields now names them
  after `taped`.
- A new kind of thing, `flat`, and six codes, all worth a look and none leaving out more than the
  ids they name: `flat/unknown-room`, `flat/room-in-two` (the room stays in the flat whose
  id comes first), `flat/unknown-type`, `flat/duplicate-id` (the first flat with the id is read),
  `flat/duplicate-type` (about the plan, its `also` naming the type) and
  `flat/zone-without-room`. A plan with no flats gets no new line. `resultVersion` stays 1.
- `grid_areas`, only on a plan that lists flats: `data.flats`, each flat's `id`, `name`, `type`,
  `typeName`, `mirrored`, `floors`, `net`, `byFloor`, `rooms` (counted), `notCounted` (`id`,
  `why`: `zone`, `outside` or `stair-below`), `leftOut` and `state`; and `data.notInFlats`, the
  net area of the rooms in no flat. The text adds "Flats, as the plan lists them:" with a line
  per flat and "In no flat", and the rule for a flat's area. The CSV adds a row per flat
  (`counted` is `flat`) and one for the rooms in no flat, before the totals.
- `grid_schedule` takes `of=flats`: `rows` (each flat numbered in id order, with `type`,
  `typeName`, `mirrored`, `floors` by name, `rooms`, `bedrooms`, `area`, `state`), `mix` (each
  type: `type`, `name`, `flats`, `mirrored`, `share`, `area`, `each`), `total`, `notInFlats` and
  `rules`. With `of=rooms` on a plan that lists flats, each row has `flat` (the flat's id, or
  null), the text says the flat, and the CSV gains a `flat` column after `state`.
- The drawing (`grid_view`, `grid draw`, the sheet) draws each flat's outline, a chain line in
  the paper's colour along the middle of the walls round its rooms (`data-part="flat"`). The IFC
  writes an `IfcZone` per flat with an `IfcRelAssignsToGroup` of its spaces and a `Grid_Flat`
  property set. `grid sheet --layout check` ends with a flat schedule page on such a plan.

### 2026-11-22: a plan from a phone room scan (HND-12)

- `grid_write_rooms` takes `scan`, a room scan file in the project (Apple's room model as JSON),
  in place of `rooms`; `rooms` is no longer required, and passing both or neither is refused.
  The answer's data gains `scan`: `null` for rooms text, else `evidence` (the file kept beside
  the plan, `<plan>.scan.json`), `paired` (each wall made from two faces: `wall`, `faces`,
  `thickness`), `oneSided` (the walls with a face on one side only), `areas` (each room's `area`
  beside the scan's `scanArea`, `from` `floor outline` or `wall faces`, and `difference`, a
  fraction), `assumed` (`text`, `parts` with `part` and `id`, and `value` or null), `leftOut` and
  `match` (`kept`, `fresh`, and `gone` with `scanId`, `part` and `id`). `rooms`, `walls`,
  `openings`, `warnings`, `verdict`, `drawingProblems`, `brief`, `reminder` and HND-11's `taped`
  are as for rooms text; `guesses` is empty.
- A plan written from a scan marks every part `scanned` and each assumed value `assumed`, so
  `grid_check` gives one `plan/value-assumed` line (`to-confirm`) for each outside wall's
  thickness and each fixture's turn. No new message code and no new tool.
- A refusal of the scan has a code of its own in its text's place (`scan/not-read`,
  `scan/no-walls`, `scan/same-id`, `scan/not-closed`, `scan/outline`, `scan/plan-changed`,
  `scan/same-file`, or a rooms-writing code such as `scan/gap`), and names the part and the
  limit, never the scan's text.

### 2026-11-22: massing before walls, and the person's site limits (BRF-4)

- A floor may state its `outline` (C17), its outside face before any wall, and how many `homes`
  and `parking` spaces it holds ([plan-file.md](plan-file.md#a-floor-outline-before-the-walls)).
  The outline is joined with what the floor's walls enclose: the slab, the roof, the gross
  external area, the plot's footprint and the floor-above line all take it. A floor with an
  outline and no walls is massing. A plan that states no outline answers as before.
- On a massing floor, `grid_areas` gives `grossExternal` and a null `grossInternal` with the
  floor's `why`; its floor carries `massing: true` (left out on every other floor), and the
  notes name the massing floors. `grid_areas` adds `storeys` (`above`, `below`, `storeys` by
  level with their `floors` and `below`, `empty`), and a "Storeys:" line when a floor is massing.
- A new worth-a-look line, `floor/past-outline`: the floor's walls reach past the outline it
  states, with the area past it. A massing floor gives no `floor/unclaimed` and no
  `floor/empty-top`, and a plan whose only content is outlines no `plan/empty`. A floor whose
  walls and outline leave floor no room claims gives `floor/unclaimed` for it, as before.
- The brief's `figures` take the person's site limits: `plot_coverage` (a percentage),
  `floor_area_ratio` (with `measure`, `gross_external` or `gross_internal`), `building_height`
  (metres) and `parking_per_home`. Their brief lines are met, missed or open, as the others.
- `grid_measure what=site` adds to its `answer`: `storeys`, `limits` (each with `limit`, `edge`,
  `state` `met`, `missed` or `not-measured`, `used`, `allowed`, `most`, `unit`, `rule`, `why`,
  `assumed`, `source`) and `brief`, and its text the massing lines and "Site limits". The
  plan's set-backs are among the limits, edge by edge.

### 2026-11-22: the preview, shared with the person (VEW-4)

- `grid_preview` writes the preview record beside the plan (`<plan>.preview.json`), so its hint
  is now write-file (`readOnlyHint` false, `destructiveHint` false). It takes `highlight` (ids,
  an empty list for none) and `camera` (a record `grid_view` returned), and `room` now frames the
  room. Its answer carries the picture the preview shows, as `grid_view` draws it, and its data
  gains `highlight`, `selected`, `camera`, `revision`, `planFile`, `previewFile` and `shown`;
  `view` is now the view shown (`2d` when none was set) where it was null when left out. With no
  argument but `plan` it no longer refuses: it reads what the person selected and writes nothing.
- A new tool after it, `grid_preview_sync`, the preview page's own call, which an MCP Apps host
  lists for the page only (`_meta.ui.visibility: ["app"]`). 31 tools.
- The server offers resources: `resources/list` and `resources/read` give the preview page,
  `ui://grid/preview`, of type `text/html;profile=mcp-app`. `initialize` and `server/discover`
  say `resources: {}` and `extensions: { "io.modelcontextprotocol/ui": { "mimeTypes": [...] } }`.
  An unknown resource is refused with -32002, without repeating its address.
- `@ongrid/floorplan/geometry` exports `pickInModel` and `pictureRay`: the part of the model a
  point on a 3D picture shows, through its camera record.

### 2026-11-22: a route's length, and the walk-through (VEW-9)

- `grid_measure what=route`'s `answer` adds `length` (metres walked, null when a room on the way
  has no outline) and `legs` (`room`, `length`: each room's share, in order; the holes through
  the walls are the rest). The text adds "Walked, …: each room's share, and … through the walls."
  and the rule it is walked by. With `width`, `way` and `shortest` each add `length`.
- `grid_describe` takes `length=walk`, `floor` (with `walk` only; an unknown floor is refused
  naming the plan's floors, whatever the length) and `pictures` (with `walk` only). Its data adds
  `pictures`: `picture`, `room`, `floor`, `eyeHeight`, `heading`, one per picture, which come
  after the text as image content, at most 12. Every other length answers as before.
- An answer may now carry several pictures (`images`), after the one `image` some tools give.

### 2026-11-22: existing, demolished and new, and a fit-out on a fixed shell (CNT-10)

- A wall, an opening and a room may state `phase`: `existing`, `demolished` or `new`, and a plan
  may name a `base` plan it is fitted out in ([phases](plan-file.md#existing-demolished-and-new)).
  A plan with neither answers exactly as before.
- In a plan with phases, every measuring tool (`grid_areas`, `grid_measure`, `grid_schedule`,
  `grid_takeoff`, `grid_describe`, `grid_find`, `grid_count`, `grid_compare`) and every check
  read the building as it will be after the work. `grid_areas` adds a first note saying so;
  `grid_describe` adds a sentence (person) or a `WORK` clause (agent) with the counts by phase.
- New codes: `plan/read-after-work` (`not-checked`, one line on a plan with phases, with the
  counts and the base), `opening/phase-wall` and `room/phase-wall` (`left-out`: an opening or a
  room that stands when its wall does not). The drawing check reads each state on its own, so a
  widened door's old and new openings, or a wall rebuilt where one is demolished, are no
  `opening/overlap` or `wall/duplicate`; a fault of a part to be demolished is reported as it
  stands before the work. `resultVersion` stays 1.
- `grid_diff` takes `since: "phase"`: the plan before its work against after it. `since` in its
  data is `{ kind: "phase", name: null, at: null, commit: null }`.
- `grid_takeoff` takes `for: "change"`: the work as three lists, each line with a new `list`
  (`demolish`, `make good`, `new`) and keys a rates file prices (`demolish:wall:interior:0.1`,
  `make_good:infill:exterior:0.3`, `new:door:0.9x2.1`). The answer's shape is `for=estimate`'s.
- The tools that change a plan: in a plan with phases what they add is `new`, a door, window,
  wall or room they take out of what stood before stays, `demolished`, and an opening they
  change keeps its old self beside it as `<id>-before`, demolished; a wall or room that stood
  before and is moved, cut or reshaped is changed in place and named in `couldNotKeep`. In a
  fit-out, a change that touches a base wall or opening is refused, naming them, and nothing is
  written.
- `grid_view` and `grid_export`: walls and openings to be demolished are drawn dashed, new walls
  filled, and the key lists the phases; the DXF puts each wall on `GRID-WALLS-EXISTING`,
  `-NEW` or `-DEMOLISHED` and the openings to be demolished on `GRID-OPENINGS-DEMOLISHED`; the
  IFC gives each element a `Grid_Phase` set.

### 2026-11-22: the person's own units, from rooms text to the sheet (WRT-7)

- Rooms text takes a length with its unit in one word (`360cm`, `12ft`, `12ft6in`, `12'6"`); a
  plain number is still metres. A unit it cannot read is refused as `rooms/units`, with the
  forms it takes.
- A `display` line in rooms text (`display ft-in`, `display mm decimal comma`) writes the plan's
  `display`, and `grid_describe as=rooms` writes it back. The plan file stays in metres.
- `grid_sheet` writes its figures, area tables and schedules in the plan's `display`: square feet
  with feet and inches, and a decimal comma when chosen. A plan with no `display` is unchanged.
- The server's instructions ask the agent to settle the person's units with the brief and to ask
  only when the person's words and place do not say. No field of the result record changes.

### 2026-11-22: a survey drawn from its own numbers (HND-11)

- A wall may be placed by a face (`face`, `left` or `right` walking from start to end), with its
  thickness stated or left out; Grid reads it on its centre line and writes it back by its face.
  Nothing in the record changes for a plan with no `face`.
- A plan may keep lengths taped on site in `taped`. The record gains `taped`, only on a plan
  that keeps some: each one taped against drawn ("Taped against drawn"). Two new codes, both
  worth a look: `room/taped-differs` and `plan/taped-not-measured`. `grid_check`'s receipt, every
  change's and `grid_write_rooms`' gain `taped`, empty for a plan that keeps none; their text adds
  the table.
- `plan/far-from-origin` measures from `site.origin` where the plan states one, else from (0, 0)
  as before; its message then names the site's origin, and its `needed` and `fix` say to keep
  survey coordinates with a stated origin rather than move them.
- The exports of a plan far from (0, 0) write it from `site.origin` where one is stated: the IFC
  puts its building on the site's point, and the GLB holds the model in one node, `origin`,
  moved by that offset, with `asset.extras.gridOrigin`. A plan near (0, 0) exports as before.
  `resultVersion` stays 1.

### 2026-11-22: a firm's own standards as checks (COD-8)

- A firm's standards file beside the plan, `firm-standards.json`, is read by `grid check`,
  `grid_check` and `grid_mark_seen`. Each part short of one of the firm's figures is a new
  `finding` line with a `firm/` code: `firm/corridor-width`, `firm/door-clear-width`,
  `firm/turning-circle`, `firm/fixture-clearance`, `firm/room-area` and `firm/room-width`; a
  file that cannot be read is `firm/not-read`, `not-checked`. The codes are the first outside
  `<thing>/<what>`: `firm/` is the family, the part is in `thing`.
- A line gains an optional `firm` (the firm's figure it was set against), and the record an
  optional `firm` (the file, whether it was read, each standard with `lookedAt` and `notes`).
  `grid_check`'s data carries both. The text sets the firm's lines under the heading "The firm's
  own standards", apart from the code figures, and says they are not tied to a place.
- With no firm's file, nothing changes. `resultVersion` stays 1: no field changed meaning.

### 2026-11-22: accessibility measurements, as numbers (CNT-17)

- The plan format takes `accessible` (C14): `rooms` by id and `routes` (`to` a room, `from` a
  room or, left out, the entrance). It is optional and never defaulted; `plan/unknown-field`'s
  list of the plan's fields now names it after `views`.
- `grid_measure` takes `what=access`, with no argument but `plan`, `units` and `decimal`. Its
  `answer` holds `marked`, `rooms`, `routes`, `unknown` (ids the mark names that are no room),
  `entrance` (`floor`, `doors`, `front`), `doors`, `corridors`, `turning`, `ways`, `figures`
  (`yours`, each with `label: "your figure"`, and `code`, the confirmed code figures used, empty
  today), `notLookedAt` and `brief` (the brief file read, or null). Each measure carries
  `against`: `{ figure, short }`, where `figure.from` is `yours` (with `label: "your figure"`) or
  `code` (only a figure a named person confirmed, `confirmedFigure`). Every step on a way has
  `kind` (`sill`, `level`, `ground`, `stair`), `at`, `height` (null where Grid cannot tell),
  `count`, `up`. The text starts with the label, then "Accessibility measurements:", and ends
  with "Not looked at:" and the rule.
- A new not-checked line, `plan/not-checked-access`, on a plan that marks any room or route:
  what is marked was not checked, as Grid holds no figure for it that a named person has
  confirmed. Its `also` lists the rooms the mark names. A plan that marks nothing gets no new
  line. `resultVersion` stays 1.
- `@ongrid/rules` exports `confirmedFigure`, `isConfirmed` and `CONFIRMED_STATUSES`: a figure is
  confirmed only with status `checked-once` or `checked-twice` and every check by a named person.

### 2026-11-22: sections, and the marks on a plan (LVL-9)

- `grid_view` takes `kind` `section`: a cut along `cut` (`{ "from": [x, y], "to": [x, y] }`, in
  metres) through every floor, looking to the `toward` side of it (`left`, the default, or
  `right`, walking from `from` to `to`), in `look`. The answer's `data` gains `section`: the
  line, `levels` (each floor's `level` and `source`, `stated`, `datum` or `worked-out`), `roofs`,
  `ground` (`level`, `stated`), `rooms` (`floorLevel`, `height`, `heightStated`), `cut` (each part
  cut: `kind`, `id`, `floor`), `shapes` (how many connected shapes they join into) and `assumed`
  (`kind`, `ids`, `words`, `hatched`). The text says the same, and lists every line of `assumed`.
- `grid_view` with `kind` `plan` takes `marks` (`levels`, `elevations`, `section`); `section`
  needs `cut`, and `cut` and `toward` are refused on a plan without it. A plan with no `marks`
  is drawn as before.
- `grid draw` takes `--section`, `--toward` and `--marks` the same way.
- `kind=section` refuses VEW-3's camera arguments (`bearing`, `tilt`, `distance`, `eye_height`,
  `lens`, `room`, `camera`, `view`, `turn`, `tilt_by`) by name, and `kind=3d` refuses `cut`,
  `toward` and `marks`; `grid draw` refuses `--section` and `--marks` with `--view`. A section's
  `data` has `view` null.
- After LVL-8: `kind=facade` refuses `cut`, `toward` and `marks`, and `kind=section` refuses
  `side`; `grid draw` refuses `--section` and `--marks` with `--facade`.
- No new code in the result record: a section and its marks are pictures. `resultVersion`
  stays 1.

### 2026-11-22: repeat, mirror and turn, and a mirrored plan recognised (WRT-4)

- `grid_diff` data gains `turn`: null, or `id` (`mirror-left-right`, `mirror-top-bottom`,
  `turn-90`, `turn-180`, `turn-270`, `mirror-diagonal`, `mirror-other-diagonal`), `mirrored`,
  `degrees` (counter-clockwise, after any mirror) and `text`, the line the text answer gives
  right after "Compared with". The verdict then starts with that line. A mirrored or turned plan
  has `sameBuilding` false, and gets no picture when nothing else changed. The core's
  `compareBuildings` gives the same `turn` and `turnLine`.
- `grid_mirror` takes `turn` (90, 180, 270 or -90) in place of `how`, which is no longer
  required: one of the two, never both. Its title is "Mirror or turn the plan". The answer's
  fields are as for every change.
- `grid_write_rooms`: rooms text's `repeat` may say where its first placement goes and take
  `first` and `last` settings; a `floor` line may end with `copy <floor> [with openings]`; a room
  line may say `through <floor>`. A room that rises through a floor not written after its own is
  refused with `rooms/unknown-floor`. No new message code and no new tool.
- With LVL-8's opening patterns: `grid_mirror` swings a pattern's door the other way with every
  plain door's, and its text, mirror or turn, adds `Its opening pattern stays a pattern, and the
  openings it places follow its wall.` when the plan has patterns. `grid_write_rooms` adds one
  line when the plan file has patterns, `Kept the plan's opening pattern as the file has it: …`,
  ending with the first thing the walls just written keep a pattern from placing, if any; its
  `drawingProblems.after` counts the plan with its kept patterns, as `before` does. A `pattern`
  line in rooms text is refused (`rooms/syntax`), saying where a pattern goes.

### 2026-11-22: the plot, its set-backs and the distances to it (BRF-3)

- The plan's `site` may hold `boundary`, `streets`, `setbacks` and `things`
  ([plan-file.md](plan-file.md#the-plot-its-boundary-set-backs-and-what-is-on-it)). A street,
  a set-back or a thing the format cannot read is left out alone (`plan/value-left-out`), the
  rest of the site kept.
- A new plan check, `site-boundary`, looks at the edges of the boundary (`looksAt: "edge"`, ids
  the edges' numbers as text, on `floor` `""`), with two new skip reasons, `no_building_outline`
  and `boundary_not_closed`. Its findings are about the plan (`thing` `{ kind: "plan" }`), on the
  floor whose outline comes nearest the edge, and carry `boundary` (`edge`, `faces`, `street`,
  `name`, `distance`, `past`, `asked` with `distance`, `from` and `source`, and `northStated`):
  `plan/setback-short`, the building nearer an edge than the set-back the person asked for, and
  `plan/over-boundary`, the building past an edge. Every record lists one more check in
  `coverage` and one more line in `limits`.
- New codes: `plan/boundary-crosses` (worth a look: the boundary crosses itself or encloses no
  ground), `plan/not-checked-boundary` (not checked: the building has no outline to measure
  from), and `plan/site-things-drawn-only` (not checked: the site's things are drawn only).
- `floor/sketch-drawn-only`'s fix now offers the site's things (`site.things`) for a fence, a
  path, a tree or a pool drawn as a sketch.
- `grid_measure` takes `what=site`, with no other argument: `answer` holds `measures`, `north`
  and `yAxis` as `what=facing` gives them, `boundary` (each edge with its distance, set-back and
  shortfall), `setbacksAre`, `footprint`, `why`, `coverage` (`ratio`, `percent`, `covered`,
  `plot`), `faces` and `things`. `grid describe` adds the plot's area, its coverage and the edge
  the building comes nearest. `grid_mirror` mirrors the boundary and the things with the walls.
- The plan's drawing holds `site` and `siteBounds` (`PlanDrawing`), on the ground floor's plan.

### 2026-11-22: a DXF a drafter can keep working in (HND-1)

- `grid_export` adds `dxfProfile`: for a DXF, the profile file in the project folder its layers
  and pens came from (`dxf-layers.json`), else null; the text adds `Layers and pens from
  dxf-layers.json.` when one was used. A profile that is there and wrong is refused, naming each
  part that is wrong (`layers.doors.colour must be a whole number from 1 to 255`); no file is
  written. No new code in the record: it is a refusal of the tool, as an empty export is.
- The DXF itself changed: AutoCAD 2013's version (`AC1027`) in UTF-8, in metres
  (`$INSUNITS` 6), with doors, windows and openings as blocks, filled wall outlines, dimension
  entities, a tag block per room and an A3 layout. The old layer names stay, with new ones beside
  them (`GRID-WALLS-FILL`, `GRID-DOORS`, `GRID-WINDOWS`, `GRID-ROOM-TAGS`, `GRID-DIMENSIONS`,
  `GRID-SHEET`, `GRID-VIEWPORT`); a room's name and area are attributes of its tag, no longer
  texts on `GRID-LABELS`, which now holds the label only. A layer is listed only when something is
  drawn on it. See [what the DXF holds](commands.md#what-the-dxf-holds-hnd-1).

### 2026-11-22: facades, and opening patterns (LVL-8)

- `grid_view` takes `kind: "facade"` with `side` (`north`, `east`, `south` or `west`, the sides
  of the drawing, north its top) and `look`: one side of the building in elevation, every floor
  at its level. Its data: `kind` `facade`, `floor` and `camera` null, `pxPerMetre`, `ids` (the
  openings it shows) and a new optional `facade`: `side`, `compass` (`{ bearing, faces }` by the
  plan's north, or null), `ground` (`{ level, stated }`), `levels` (`floor`, `name`, `level`,
  `height`), `walls`, `openings` and `extent` (`u0`, `u1`, `bottom`, `top`, or null when nothing
  faces that side). `side` with any other kind is refused, as the other kinds' arguments are.
- A plan may state opening patterns, `patterns`. Every tool and check reads the plain openings
  they expand into, with ids `<pattern>-<floor>-<n>`, as if written by hand: `grid_check`'s
  escape and route checks count them, the schedules list them, the exports hold them. The tools
  that change the plan keep the patterns as patterns.
- A new kind of thing, `pattern`, and six codes for what kept a pattern's openings from being
  placed, each `left-out`: `pattern/unknown-wall`, `pattern/does-not-fit`,
  `pattern/unknown-floor`, `pattern/no-wall-above`, `pattern/overlaps-opening` and
  `pattern/id-clash`. A pattern the reader cannot read is `plan/part-left-out`, named
  `Opening pattern "id"`. `resultVersion` stays 1: no field changed meaning.
- `plan/unknown-field`'s `needed` on the plan lists `patterns` among the plan's fields.

### 2026-11-22: a camera an agent can set, saved as a named view (VEW-3)

- `grid_view` `kind=3d` takes `bearing`, `tilt`, `distance`, `eye_height`, `lens`, `room`,
  `camera`, `view`, `turn` and `tilt_by` beside `floor` and `from`; a refusal of an argument
  another kind takes lists them all. `eye_height` is now 0 to 10,000 m in the schema, and
  `kind=eye` still refuses one outside 0.3 to 3.
- `camera` in `grid_view`'s data is the camera record for `kind=3d` and `kind=eye` (null for
  `plan`), in place of `{ at, heading, tilt, fov }`: `target` (`room`, `point`), `bearing`,
  `bearingFrom` (`north` or `plan up`), `north`, `tilt`, `distance`, `eyeHeight`, `floor`, `lens`
  (`focalLength` in mm, `sensor` 36 × 24 mm), `cut`, `floors`, `standingIn` (`room`, `name`,
  `floor`, `words`: `outside any room` when it stands in none), `position`, `direction`, `up`,
  `fieldOfView` (vertical, degrees) and `aspectRatio`. The old `at` is `position`, the old
  `heading` is `direction` on the drawing, the old `tilt` (negative looking down) is `tilt`
  (positive looking down), the old `fov` is `fieldOfView`. Data adds `view`, the saved view's
  name or null. The text adds the camera in two lines, how to move it, and the plan's saved
  views. The 3D view's default `from` is read as before.
- A new tool, `grid_save_view`, the last of the 30: saves a camera record by name in the plan's
  `views` ([plan-file.md](plan-file.md#saved-views-and-the-camera-record)), with `replace` and
  `remove`. Its receipt is the change receipt with `view`, `removed`, `camera` and `views`.
- `grid_mirror` mirrors the plan's saved views and says so in `changed`.

### 2026-11-22: which rooms get the sun, as a table (BRF-5)

- `grid_measure` takes `what=sun`, with `room` for one room: `answer` holds `measures`
  (`"geometry, not a daylight result"`), `north` and `yAxis` as `what=facing` gives them, and
  `rooms`, each with `id`, `name`, `floor`, `floorArea` (net, m²), `windowArea` (m²),
  `windowToFloor` (the ratio of the two, or null for a room with no floor area) and
  `windowWalls`. Each window wall has `wall`, `from` and `to` (metres along the wall), `faces`
  (one of the eight points), `bearing` (degrees clockwise from north), `windows` (`id`, `width`,
  `height`, `area`), `windowArea` and `depth`: metres, square to the wall, from its inside face
  to the farthest point of the room's floor. A room with no window in an outside wall has an
  empty `windowWalls`. Every line of the table in the text starts "Geometry,"; a plan that
  states no north says so on the line after the label. No new message code and no new tool.

### 2026-11-22: sloped ceilings and roofs (LVL-6)

- A floor may state its `roof` (flat, mono-pitch, gable or hip, with `eaves` and a `pitch` or a
  `ridge`). Its walls are cut to it, so a wall's top may slope: the new refusal
  `opening/above-roof` names a door or window whose top lies above the roof over its stretch of
  wall, with the height that fits at its sill as its fix (`height`), as `opening/too-tall` does.
- New refusal `floor/rooflight-misplaced`: a rooflight (`floors[].roof.rooflights`) outside the roof
  or across a ridge or a hip is left out. New warning `floor/dormers-not-drawn`: a roof that lists
  `dormers` is drawn and measured without them; dormers are not supported yet.
- `opening/missing-wall` on an opening whose wall names the roof, a room or a floor adds that a
  window in the roof is a rooflight in its floor's roof, and that dormers are not supported yet.
- `grid_areas` answers `headroom`: the floor by headroom band (at least `headroomLow`, 1.5 m, and
  `headroomFull`, 2.2 m, Grid's own figures) over the floors that state their roof, else null;
  such a floor's rooms carry `headroom` (`bands`, `lowest`, `highest`), and `measures` holds the
  rule `headroom`.
- `grid_takeoff`'s roof lines gain `shape` (null for the flat roof Grid lays on the walls), `pitch`,
  `slopeArea` and `rooflights`; a room's `wallFace` is measured under the top the roof leaves each
  wall. `grid_measure`'s room height under a stated roof comes `from: "roof"`, with `roof`
  (`lowest`, `highest`).
- The IFC writes a wall the roof cuts, and a space under the roof, as a clipped solid
  (`Clipping`), and a sloped roof as an `IfcRoof` of its type over one clipped `ROOF` slab, with
  each rooflight an `IfcOpeningElement` filled by an `IfcWindow`.

### 2026-11-22: the brief beside the plan, met or missed after every change (BRF-1)

- A new tool, `grid_write_brief`, writes what the person asked for into `<plan>.brief.json`
  beside the plan, never the plan, in one call and before the first room if need be: room wishes
  (`name` or `use`, `count`, `area`, `at_least`, `at_most`, `inside`), `footprint`, `touch`, the
  person's own `figures` (`door_width`, `corridor_width`, `turning_circle`, `step`,
  `ceiling_height`, under the heading "The person's own figures: theirs, not from any code or
  standard.") and `open`. Each wish has a `level` (`must`, `should`, `avoid`) and a `source`
  (`given`, which needs `quote`, or `assumed`). A figure Grid does not know is refused with the
  ones it knows. Left without `brief`, it reads the brief and writes nothing. With WRT-6's `grid_square_scan`, CNT-9's three reading tools and WRT-8's `grid_diff` and `grid_mark_start`, the tools are 29.
- Every change to the plan, and `grid_write_rooms`, adds `brief` to its receipt: `{ file,
  problem, lines }`, each line met, missed, open or differs, with `asked` and `drawn` in words.
  The text adds the lines, at most 12, missed first. A brief that can't be read is one line and
  never refuses the change.
- Until the brief gives a room a size, a size in the room's name (m², ft², mats) is read against
  the room, as a line `differs` when it is more than 2% off (`nameSize`).
- `grid_write_rooms` adds `reminder`: one line when a plan is first written with no brief beside
  it, never a refusal.
- No new code in the result record: the brief's lines are in the change receipts, not in
  `grid_check`. `resultVersion` stays 1.

### 2026-11-22: zones inside one room (CNT-8)

- A room may state `partOf`, the id of the room it is a zone of. A zone is drawn and measured, and
  counted in no total. New code, worth a look: `room/zone-not-in-room`, a room marked as a zone
  of a room that is not on its floor, is a zone itself, or does not hold it. It also makes a
  room's area `not-proven`.
- The size and escape checks look at a room with zones as a whole. New skip reason in
  `coverage`: `part_of_room`, a zone; the route checks skip zones the same way. A figure check
  that looked at a room with zones adds `wholeRooms`, each with the use applied and the zone it
  was read from. A `room/too-small` line about such a room names its zone in `also`, and its
  `found` ends ", the whole room with its zones, checked as a bedroom, the use of its zone
  "Sleeping corner"". The report's finding adds `use` and `zone`. Nothing changes on a plan
  with no zones.
- `grid_merge_rooms` takes `zones` and `new_room`. Two rooms of different uses with neither
  `use` nor `zones` are refused, asking for one (lab AB-9). Every edit's `verdict`, and
  `grid_compare`'s, ends with any use no room or zone has any more: "The plan now has no room or
  zone used as kitchen, which the plan before had."
- `grid_areas` adds `zoneOf` on a zone, and its CSV says `zone` in the `counted` column; the room
  schedule adds `zones` on a room with zones, and a zone is no row of its own.
- With CNT-5, CNT-13 and SHT-11 (merged from `main`): a zone may have any of the 27 room uses. The
  size and escape checks read a room with zones by the uses in their `coverage.uses`, in that
  order; on a floor the plan says is a kind of building a check does not run in, its zones are
  skipped as `not_for_building` with every other room. A zone is in no stair stack, so it never
  has `countedWith`. `grid_measure` with `what=use` on a zone, or `what=route` from or to one,
  measures its room as a whole and says so; the answer names the zone (`zone`, `fromZone`,
  `toZone`).
- With LVL-4 (merged from `main`): a zone has no ceiling, slab, void or opening of its own. In
  `grid_takeoff` its room's ceiling and the floor's `envelope` are the same as for the room drawn
  without zones, and a zone used as a stair or lift opens no slab.
- With WRT-6 and HND-2 (merged from `main`): a zone's `sureness` in `grid_areas` is its own, and
  is added into no floor's or plan's `sureness`, so those are the same as for the room drawn
  without zones. In the IFC a zone has no space and no number (`roomNumbers` numbers rooms
  only), so the room schedule and the spaces number every other room as without zones.
- With CNT-9 and MSG-5 (merged from `main`): a zone keeps its facts of the person's own, and any
  number it states stays in the plan but is not read: `roomNumbers`, the schedule, the IFC, the
  DXF and `grid_find`'s `number` give a zone none. A zones merge gives the merged room what a
  merged room gets without zones (the first room's number and facts, with the second's it does
  not carry), and both rooms keep theirs as zones. `grid_count` counts no zone in a group or the
  total, and its text names the zones left out. The schedule lists each zone's facts under its
  room. No message code changed.

### 2026-11-22: what a change did, by what stands where (WRT-8)

- New tool `grid_diff`, second in the list after `grid_compare`: the plan against a start marker
  or its last commit. Data: `since` (`kind` `marker` or `git`, `name`, `at`, `commit`),
  `verdict`, `sameBuilding`, `roomsFirst`, `shift`, `renamed` (`count`, `walls`, `openings`,
  `rooms`), `issues` (`code`, `message`, `entities`), `rooms` (`room`, `name`, `status`
  `unchanged`, `changed`, `moved`, `added` or `removed`, `before`, `after`, `moved`, `text`),
  `changes` (`text`, `entities`, `rooms`), `stayed` (`opening`, `text`), `scope` (`checked`,
  `rooms`, `outside`) and `picture` (`floor`, `width`, `height`, `pxPerMetre`, or null). Issue
  codes: `door_joins_other_rooms`, `opening_crossed`, `room_unclosed`, `dangling_host`,
  `invalid_base`, `invalid_head`, `unknown_target`, `note_added`, `note_gone`,
  `suspected_id_churn`. They are the comparison's own, not lines of the result record.
- New tool `grid_mark_start`, before `grid_mark_seen`: writes `plan.markers.json` beside the plan
  and never the plan. Data: `written`, `name`, `at`, `replaced`, `removed`, `markers`. With
  WRT-6's and CNT-9's tools, the tools are 28.
- `diffPlans` in `@ongrid/floorplan` reads a room's walls as a ring: the same walls from another
  wall, or the other way round, are no change (lab U-4). Walls in another order still are.

### 2026-11-22: the place stored with the plan (COD-3)

- The plan may state its place, `site.country`: a country's name or its two- or three-letter
  code on Grid's list. `grid_check` reads it on its own; its `country` argument names another
  for one call and now takes the same names and codes (`US`, `USA`, `United States`, `Spain`),
  up to 60 characters. A place not on the list is refused, naming the argument, never the text.
- **With no place stated, no figure is applied.** Before, the US figures applied to every plan
  that named no country. Now neither figure check runs: no `room/too-small` or escape line, no
  figure in `figures`, and their `coverage` skips every room with the new reason `no_place`.
  Pass `country: "US"`, or write `site.country`, for the US figures.
- The record and `grid_check`'s data gain `place` (`{ country, name, from }`, or `null`) and,
  with no place, `withoutPlace: { usLines }`, the lines the US figures would have given.
- The text's second line, after the label, says the place and the figures applied, or that none
  was and how many lines the US figures would have given.
- `plan/not-checked-sizes-for-place` and `plan/not-checked-escapes-for-place` name the place by
  Grid's name for it ("this plan is for Spain", "for the United Kingdom"), never as it was given
  ("for ES").
- The short report says the two figure checks that did not run for want of a place in one line,
  and the kind of building the figures were read for in the place line, in place of the line
  "Both checks that use figures read them for …".

### 2026-11-22: facts of the person's own, and asking across them (CNT-9)

- Three new reading tools, after `grid_schedule`: `grid_fields` (what can be asked: `kinds`,
  `fields` with their `unit`, and `facts` with `count`, `kinds`, `type` and `values`),
  `grid_find` (`count`, `ids`, `rows` holding `id` and only the fields named, `more`, `floors`,
  `view`, `rule`) and `grid_count` (`by`, `groups` each with `value`, `count`, `sums`, `missing`
  and `ids`, `total`, `units`, `view`, `rule`). `view` holds the arguments of `grid_view` that
  show the answer. A field or fact the plan does not have is refused with the nearest name.
  The tools are 26.
- `grid_view` takes `highlight` (ids to pick out) and a field or fact in `colour` (any name
  besides `use`), and then answers `painted`: each colour with what it stands for and its ids.
  `colour` is now text of at most 120 characters, no longer only `use`.
- `grid_schedule` with `of=rooms`: each row has `roomNumber` (the plan's, or null) and
  `properties`; a room that states its number is listed first on its floor and shown by it, in
  the text and the CSV's `number` column. `number` is still Grid's count. With `of=openings`,
  each row has `properties`. The CSVs add a column per fact, after the others.
- Edits keep the facts: `grid_split_room` gives the new room the room's facts (not its number),
  and `grid_merge_rooms` says in `notKept` what the second room said otherwise and the number
  that is gone. `grid_write_rooms` keeps each part's facts and number by id, and says so.
- No new message code: a fact the format cannot read is `plan/value-left-out`, at its own place
  (`walls[0].properties.<name>`), and the part keeps its other facts.

### 2026-11-22: notes traced to their cause (MSG-5)

- A line that follows from another carries `causedBy` (`{ code, id }`) and comes right under it,
  whatever its kind; the record adds `problems`, the lines that follow from no other, `not-checked`
  aside. See "Causes and follow-ons". The kinds keep their order for the lines that follow from
  nothing; `count` and `counts` are as before. On the lab's 26 fault plans (group E), 90 lines are
  30 problems with 43 lines beneath them.
- A note that rests on a part that could not be drawn is no longer given: a way out, a route, "no
  door", a door into a space not drawn and the escape notes, by the lab's rule (W-6). The floor's
  "could not be drawn" line names the part and keeps each note under `held`. The plan with one
  undrawable corridor gives 0 notes and that one line, where it gave 16 notes. `coverage` lists
  those parts as skipped, `waits_for_part`. A door the reader left out, or on a wall the plan does
  not have, now gives that line too (lab M-9: before, nothing was listed as not checked).
- A fixture said to stand in no room (`item/outside-rooms`) because the room it stands in could
  not be drawn, or was left out by the reader, follows from that room's line. `item/blocks-doorway`
  and `item/blocks-window` follow from nothing, and are not given for an opening or a wall that
  cannot be drawn: the floor's "could not be drawn" line names the opening.
- Identical notes are one line listing the rooms, with `each` (lab MS-14: twelve hotel rooms,
  one line). Its message lists the names where the one name goes, the verb agreeing.
- New code `plan/no-walls` (`left-out`): the plan has no walls, but its rooms and openings name
  walls. Every room and opening line follows from it.
- Wordings changed: `floor/not-checked-rooms-not-drawn` now reads "these rooms could not be
  drawn, so they and what rests on them were not checked: …"; `floor/not-checked-doors-not-drawn`
  "these doors or windows could not be drawn, so they and what rests on them were not checked: …",
  naming them. Their `found` lists the notes held back, their `fix` says those come back.
- `grid check` sets a follow-on under its cause with "follows from", and the notes held back
  under their line; `grid_check` returns `problems`, and its text says how many lines follow.
- A line for several rooms is one note to mark seen (MSG-10): the mark holds every room in it,
  and a mark on one room's note, made before they were one line, brings the line back as new
  (`seen.state` `back`) rather than holding.

### 2026-11-22: what was given and what was assumed (WRT-6)

- A new kind of line, `to-confirm`, listed last, and a new code, `plan/value-assumed`: one line
  for each value, or whole part, the plan's `marks` say was assumed, about that part. `counts`
  has the new kind; `count` holds these lines too. `grid check` prints them under "To confirm",
  and `grid_check`'s text names them even past its first 12 lines.
- `plan/mark-no-part` (`worth-a-look`): a mark that names a part the plan does not have.
- `grid_areas` gives `sureness` (`source`, `plusMinus` in m², `percent`) on each room whose walls
  the plan marks, on each floor and on the plan (null on the plan when no wall is marked), and its text says "from a scan, about ± 1.6%".
  `plusMinus` and `percent` are null when a scanned wall states no tolerance.
- A new tool, `grid_square_scan`, after `grid_rename_room`: it squares the walls marked scanned,
  and its receipt adds `moves` and `leftAsTheyAre`. With `grid_mark_seen` (MSG-10), the tools are 23.
- A `to-confirm` line can be set aside as seen like any other (MSG-10): it is then listed under
  "Seen", not "To confirm". Each assumed value of a part is its own note, so marking one leaves
  the others listed, and a change to the part's marks brings a seen one back.
- A wall that states no height is described as "wall height not stated (drawn 2.7 m high)" by
  `grid_describe`, and its rooms text (`as=rooms`) states no height for it.

### 2026-11-22: slabs, roofs, ceilings and the ground (LVL-4)

- New finding `opening/below-ground`, under the new plan check `openings-above-ground`: a door,
  window or doorless opening in an outside wall that lies below the ground level the site states
  (`site.ground`, beside CNT-3's fields of `site`), wholly or in part. The finding carries `belowGround` (`foot`, `top`, in metres
  under the ground, and `wholly`). With no ground stated the check skips every door and window with
  the new reason `no_ground_level` and is not among the checks run; every report's limits gain one
  line saying so.
- With a ground level stated, the ground floor is the floor nearest it, and a floor stands above the
  ground by its height over that level: `opening/door-out-above-ground` gives that height.
  Unstated, both are as before.
- A room marked `void` needs no door and has no route to check: it is no room to stand in.
- `grid_takeoff` answers `envelope`: per floor the slab (as built, less its openings over stairs,
  lifts and voids), the roof over every part with nothing above, and each figure's `assumed` list,
  what Grid took that the plan does not state. Room lines gain `ceilingHeight` and `lowered`.
- The 3D still (`grid_view`) and the exports draw a slab under every floor and a roof over every
  part with nothing above; a still of one floor alone still has no roof.

### 2026-11-22: use indicators round the fixtures (CNT-13)

- A fixture is an obstacle to a door's swing: `opening/door-hits-item` (worth a look) names the
  door, has the fixtures' ids in `also`, and words each by its label, kind and id:
  `Door "d1" hits "Table 2" (kitchen run "table-2") when it opens`. A wall in the way is still
  `opening/door-blocked`.
- New codes, worth a look, about a fixture (`thing.kind` `item`) with the opening's id in
  `also`: `item/blocks-doorway`, a fixture within `useApproachDepth` (0.3 m) in front of a
  doorway's hole, and `item/blocks-window`, one higher than a window's sill in front of it. Each
  `found` says what was measured, with what depth, and that it is an indicator, not a rule. A
  plan without fixtures gets none of them.
- `grid_measure` takes `what=use` (with `room`, and optionally `width`, `diameter` and the new
  `clearance`): `answer.indicators` lists each indicator as `{ code, about, measured, figure:
  { value, from: "person" | "grid" }, under, at?, detail? }`, with `code` one of
  `use/turning-space`, `use/doorway-clear-width`, `use/passage-width`, `use/space-by-fixture`
  and `use/window-blocked`. Each text line starts `Indicator,`.
- `what=route` takes `width`, a body or a trolley: `answer` holds `through`, `width`, `figure`,
  `way` (the way it gets through by, or null), `shortest` (the way with the fewest rooms,
  measured: each room's `width` with `at`, `beside` and `atDoorway`, each step's `clear` width
  and `narrowedBy`) and `narrower` (what on it is narrower than `width`). Without `width`, the
  route answer is as before.

### 2026-11-22: stairs counted once, and the drawing's symbols (SHT-11)

- `grid_areas`: rooms used as a stair that lie one over the other on neighbouring floors are one
  stair, counted once, on the floor it rises from. Each stair room over it keeps its own `net`
  and gains `countedWith` (`floor`, `room`: the lowest stair room); it is in no net total, area by
  use or circulation figure. Each floor gains `overStairs`, their area. A note names the stair and
  the floors over it, the text says "counted once with …" on each such room, and the CSV's
  `counted` column says `with the stair below`. The net rule's sentence says so. A plan with no
  stair rooms stacked so is unchanged. `grid sheet`'s area table prints "counted below" for them.
- `grid_takeoff` with `for=estimate`: the `floor:<use>` lines leave those stair rooms out as the
  net area does, so `floor:stair` counts the stair once; the `floor` rule's sentence says so. The
  wall faces, skirting and ceilings still count every room.
- `grid_view` (kind plan) and `grid draw` take `above` in `hide`: the dashed outline of the floor
  above. No code is added and no check changes.

### 2026-11-22: what kind of building it is, and more room uses (CNT-5)

- A plan may say what kind of building it is (`building`: `home`, `office`, `shop`, `food`,
  `hotel`, `school`, `health`, `sport`, `assembly`, `industry`, `warehouse`, `parking` or
  `other`), and a floor may say otherwise for itself (`floors[].building`). Unstated, nothing
  changes.
- The figure checks (room size, escape openings) run only where the building, or its floor, is
  a home, or where the plan does not say. Elsewhere their rooms are skipped as
  `not_for_building`, and one line says so: about the plan (`plan/not-checked-sizes-for-building`,
  `plan/not-checked-escapes-for-building`) when the plan's own kind is the reason on every
  floor, else about each floor (`floor/not-checked-sizes-for-building`,
  `floor/not-checked-escapes-for-building`). New codes and a new reason, all `not-checked`;
  `resultVersion` stays.
- `coverage` adds `uses` and `buildings` on each figure check: the room uses it looks at and the
  kinds of building it runs in.
- Room uses run to 27: `toilet`, `utility`, `study`, `office`, `meeting`, `reception`, `retail`,
  `classroom`, `treatment`, `waiting`, `sport`, `changing`, `staff`, `worship`, `assembly`,
  `plant` and `parking` join the ten (LVL-3 added `lift`), and `other` is listed last. A drawing
  coloured by use (SHT-7) gives each its own pale fill. A word that plainly means a use
  (`WC`, `staff room`, `warehouse`, `bryggers`) is read as it and gives no `plan/unknown-use`
  line; no word is read as `bedroom`, `living` or `dining`. The tools' `use` arguments take the
  new uses.
- A room may say who it is for (`tenure`: `private`, `shared`, `common` or `commercial`) and carry
  the firm's own room type (`roomType`). No check reads either yet.
- A note or sheet line that used a figure, on a floor the plan says is a home, ends "and the plan
  says this is a home" instead of COD-2's "the plan does not say what kind of building it is, so
  Grid applied them as they are", which stays where the plan does not say.

### 2026-11-22: a short report, and notes set aside as seen (MSG-10)

- `grid_check`'s text is short by default: the label, the lines, what each check looked at in
  counts, and one line on what `full: true` adds. `full: true` adds the checks run, every figure
  (as "The figure used here for …", with its basis and status), each check's skipped parts and
  what these checks never look at. Before, the text always ended with the never-looked-at lines;
  they are still in `limits` in the data, which is unchanged but for the fields below.
- `grid_check` takes `full`, and its data gains `seenCount`, `marksFile`, `marksProblem`, and
  `seen` on each line the person marked: `{ state: "seen" | "back", reason, by, at, changed? }`.
- A new tool, `grid_mark_seen`, sets a note aside as seen with the person's reason and the name
  or role they give, or takes the mark off (`unmark`). It takes the note's number and code as
  `grid_check` gave them, and refuses a number that now names another code. It writes only
  `<plan>.seen.json` beside the plan. The tools are 22.
- A seen note is listed under "Seen" in the text, and still counted. When one of its parts
  changes, it is listed with the others again, saying so.

### 2026-11-22: north, front and where the building is (CNT-3)

- The plan may hold `north`, `yAxis`, `front` and `site` ([plan-file.md](plan-file.md#north-front-and-where-the-building-is)).
  A plan that states none gets every answer as before.
- `grid_measure` takes `what=facing`, with `room` for one room: `answer` holds `north` (`stated`,
  and `degrees` counter-clockwise from the top of the drawing, or the `assumed` north), `yAxis`,
  `front`, and `rooms`, `walls` and `openings`, each with the compass point it `faces`
  (`north`, `north-east`, … `north-west`) and, for walls and openings, its `bearing` in degrees
  clockwise from north. A plan that states no north is answered with north as the top of the
  drawing, and the text's first line says so.
- New codes, worth a look: `plan/front-not-said`, a front that names a part the plan does not
  have or a wall that does not face outside, naming it in `also`; `plan/y-down`, a plan whose y
  runs down the page.
- `grid_view`'s text for a plan that states its north says where the north arrow points, in
  place of "the plan holds no real north". `grid_describe` adds a few lines on north and the
  ways the rooms face for a plan that states its north or its front, and leaves "north" out of
  what is not in the plan. `grid_mirror` mirrors the stated north and the site's origin, and
  says so in `changed`.
- The IFC export writes the stated north as `TrueNorth`, and none for a plan that states none
  (it wrote +y before), and the site's origin, latitude, longitude and elevation when stated.

### 2026-11-22: sizes along the walls, in chains (SHT-4)

- No line, code or wording of the record changes.
- The floor plan picture (`grid draw`, `grid_view` kind plan, the sheet) dimensions each room
  along its walls' faces: width and depth for a room with four square corners, one size per
  side for any other, each line inside its room. Outside the plan, each side has a chain of
  openings, a chain of walls and the overall size, along the plan's own main directions, and
  each chain adds up to the overall size. In the technical look the lines end in 45-degree
  ticks with the numbers along them.
- In an SVG, each dimension's group carries `data-measured-to`, what its two ends measure to
  (`face`, `centre-line` or `finish`), and `data-kind` is `overall`, `wall`, `opening` or
  `room`.

### 2026-11-22: quantities for a first estimate (ARE-13)

- `grid_takeoff` takes `for` and `rates`. With `for=estimate` its data holds `label`, `lines`
  (each with `key`, `what`, `quantity`, `unit` of `m2`, `m` or `nr`, `rule`, `assumed`, and
  `floors` for the slab, upper floors and roof), `notes` and `rules`; then either `rateCard`
  (no rates file: `{label, currency, rates: {key: {rate: null, unit}}}`, ready to fill) or `cost`
  (`file`, `label`, `currency`, `total`, `complete`, `missing`, `wrongUnit`, `unused`,
  `wholeBuilding`) with `orders` and `orderProblems`, and each line adds `state` (`priced`,
  `no rate`, `wrong unit`, `alternative`), `rateKey`, `given`, `rate`, `priced` and `amount`.
  `format=csv` gives the bill as one table. Without `for` the answer is as before, with one more
  line saying `for=estimate` exists.
- The rates file is `rates` (a path inside the project) or `rates.json` beside the plan. One
  that names no currency, holds a negative rate, a unit Grid does not take, a key that is not a
  key or a field Grid does not read is refused (`isError: true`, one line naming the file and the
  part). `rates` without `for=estimate`, and `rooms` with it, are refused.

### 2026-11-22: the label first, and no line reads as approval (MSG-3)

- Every tool answer leads with the label, and its data carries `label`; every output schema
  lists it as required. A CSV's first row is the label in one cell; rooms text from
  `grid_describe` as=rooms starts with it as a comment, which writing it back ignores.
- `needed` on `room/too-small`, `room/escape-window-too-small` and `room/escape-window-too-high`
  gives the figure as "the figure used here", with its basis and status.
- `opening/too-small-to-pass` keeps its code; its wording, `needed` and `fix` say "get through".
- `grid check` gives each figure as "The figure used here for … is …", with its basis and
  status, and a check that looked at nothing as "Nothing was checked for …". `grid_check` says
  the same in its text.
- The tool server's instructions tell an agent how to retell a report: the label first, none of
  the forbidden words, and each figure with its basis and status.

### 2026-11-22: where each opening stands (MSG-16)

- Five new warnings, `worth-a-look`, in `grid check` and `grid_check`. None of them leaves
  anything out: the opening is still drawn, cut through its own wall only.
  - `opening/crosses-wall`: the opening runs into the body of a wall that meets its wall (a
    corner, a junction, a wall passing through). `also` names that wall and the opening's wall;
    the line gives the offsets that keep it clear.
  - `wall/ends-in-opening`: a wall ends on another inside one of its openings. The line is about
    the wall that ends; `also` names the opening and the wall it lands on.
  - `opening/fills-wall`: the opening is as long as its wall.
  - `opening/on-dividing-line`: a door or a window on a dividing line. `also` names the line.
  - `opening/window-between-rooms`: a window in a wall with rooms on both sides, which may be a
    borrowed light. `also` names the wall and the two rooms.
- `grid_split_room` refuses a new wall whose end would land inside a door or window of the wall
  it meets, and names the nearest place along the room where it would not.

### 2026-11-22: units at the edge (WRT-7)

- Every length argument takes a number in metres, or text with its unit (`"12'6\""`, `"900 mm"`,
  `"381 cm"`); with `decimal: "comma"`, a decimal comma (`"3,81"`). Its schema is
  `["number", "string"]`. A length Grid cannot read is refused by the argument's name.
- `grid_areas`, `grid_takeoff`, `grid_schedule`, `grid_measure` and `grid_view` take `units`
  `m`, `cm`, `mm` or `ft-in` (`ft` is the same as `ft-in`) and `decimal`; left out, the plan's
  `display`. Feet and inches are written `12'-6"` (they were `12' 6"`), a window's sill in inches.
- A plan file with `"units": "mm"`, `"cm"`, `"ft"` or `"in"` is read in that unit, with a
  `plan/read-as-meant` line, and a change writes it in metres. No new code.

### 2026-11-22: what would be right (MSG-7)

- A line gets `fixes` where a change to one part would clear it, and in `grid_check` the
  `calls` that make them, ready to send: `opening/out-of-wall` (the offset that fits keeping its
  width, and the width that fits keeping its offset), `opening/too-tall` (the height that fits at
  its sill), `opening/negative-sill` (a sill of 0) and `opening/missing-wall` (the wall most
  likely meant, as data only). `grid_check`'s text says how many lines carry a call.
- Wordings changed, each in `found` (the check's sentence) and, where named, in `needed` and `fix`:
  - `wall/zero-length`: "starts and ends at the same point, (x, y), so it has no length", in
    place of "has start === end".
  - `opening/missing-wall` and `room/unclosed` for a wall the plan does not have: "which is not
    in the plan", with ": did you mean "…"?" when one is near, in place of "which does not
    exist". `needed` and `fix` name the wall meant.
  - `opening/out-of-wall`: `found` adds "at its offset of 0.50 m, a width up to 3.80 m fits";
    `needed` and `fix` give the offset and width that fit, in metres, in place of "as the line
    found says".
  - `opening/too-tall`: `found` adds the height that fits at its sill; `needed` and `fix` give it.
  - `opening/negative-sill`: `found` says how far below the floor, and that a sill of 0.00 m or
    above fits.
  - `room/escape-window-too-small`: `found` names the measure that fails against what it needs
    first ("0.6 m high, under the 0.61 m needed"), then the ones that are enough. The figures,
    their sources and status, and the label are unchanged.
- The nearest id is worked out one way everywhere (`likelyMeant`, `likelyId` and `closestId` in
  `@ongrid/floorplan/types/nearest`): MSG-4's unknown words, the drawing check's walls, the
  floor ids, and the tool server's refusals. A refusal now names "the nearest known id" only when
  one is near (a shortening, other capitals or joins, or one slip); `grid_measure`'s refusal of a
  wall that is not there lists the plan's walls when none is near.

### 2026-11-22: writing on the drawing, and the sketch layer (SHT-7)

- The plan may hold `title`, `annotations` and `sketch`. None of them changes an area, a check or
  a wall count. A field the format does not have on a note or a sketch item is a
  `plan/unknown-field` line, as on any other part.
- New code, not checked: `floor/sketch-drawn-only`, one line per floor with a sketch, naming its
  items in `also`: the sketch is drawn and exported, and never measured or checked.
- New code, worth a look: `plan/note-no-place`, a note in a room the plan does not have, naming
  the note and the room in `also`. The note is not drawn.
- `grid_view` (kind plan) takes `hide`, `colour` and `key`.

### 2026-11-22: a problem report the person files (CMD-13)

- New tool `grid_report_problem`, read-only, last of the reading tools: a draft issue from a
  failure you met, with the call, its answer, the record's line for a code you pass, Grid's
  version and the smallest plan that shows it, cleared of names, ids, addresses and paths. It
  returns `title`, `body`, `labels`, `link` (the issue form), `linkHasBody`, `code`, `plan`,
  `kept` and `sent: false`. Grid sends nothing: show the person the draft.
- A tool call now sees the protocol version a 2026-07-28 request names. No other answer changes.

### 2026-11-22: an export says what it leaves out (HND-6)

- `grid_export` adds `leftOutParts`: each part of the plan the file leaves out, with its kind,
  id, place, floor and the code of the line that leaves it out. The file says it too: the
  property set `Grid_LeftOut` in an IFC, the layer `GRID-LEFT-OUT` in a DXF, comment lines in an
  OBJ, `asset.extras.gridLeftOut` in a GLB. A file that leaves nothing out is as it was.
- `leftOut` counts what this file leaves out: the parts the reader left out (`plan/id-clash`,
  `plan/part-left-out`) and the parts its floors cannot draw. Before, it counted the ids
  `grid_check` calls broken in the whole plan, which named walls a file holds (a wall id used
  on several floors is drawn on each) and missed parts the reader left out.
- An export that would hold no wall, room or fixture is refused (`isError: true`, one line that
  starts "Nothing to export"), and nothing is written. Before, it wrote a valid empty file.

### 2026-11-22: schedules (ARE-12)

- `grid_schedule` takes `of`: `rooms` gives the room schedule, `openings` each door, window and
  doorless opening once. Its data then holds `rows` (each numbered by Grid, in one order whatever
  the file's), and for rooms `floors` (each floor's total, with its name) and `total` (all floors),
  each total with its state, and `rules`. Without `of` the answer is as before. With `of`, `types`
  and `narrower_than` are refused. A row that cannot be written is an error naming the row.
- `grid sheet --layout check` ends with two pages, "Room schedule" and "Door and window schedule".

### 2026-11-22: which kind of building a figure was read for (COD-2)

- Every figure, in `figures` and on a finding, adds `readFor`: the kind of building it was read
  for. Every figure today is `homes`. A plan cannot say yet what kind of building it is, so a
  figure is applied whatever the building, and every note and pass that used one says so.
- `coverage` adds `readFor` on a figure check that looked at something, so a pass with no
  finding says it (lab CH-2: a café's seating marked "dining" passed against a home's figure
  without a line).
- `needed` on `room/too-small`, `room/no-escape-opening`, `room/escape-window-too-small` and
  `room/escape-window-too-high` ends "; this check's figures were read for homes (houses and
  flats people live in)". No code changes meaning, so `resultVersion` stays.
- `grid check` prints it after each such check's findings and on each figure used; `grid_check`
  prints `Needed:` on those lines and the kind on each such check; the notes on a plan and the
  check sheet add the sentence.

### 2026-11-22: version 1 (WRT-3)

- Five changes to the plan are new tools and `grid edit` verbs: `grid_merge_rooms`,
  `grid_split_room`, `grid_add_room`, `grid_stretch` and `grid_rename_room`.
  `grid_change_opening` moves and places an opening (`room`, `side`, `from`, `distance`);
  `grid_move_room_side` takes an inside size (`to`).
- Every edit receipt adds `guessed` and `couldNotKeep`. No new message code: refusals of an
  edit are one line, as before.
- An opening may state `anchor` in the plan file: what Grid's edits keep its place from.

### 2026-11-22: version 1 (MSG-4)

- New codes, all worth a look: `plan/unknown-field`, `plan/unknown-use` and `plan/empty`. A
  field or a use Grid does not read was dropped in silence before. `{}` gives `plan/empty`,
  beside MSG-2's `plan/not-checked-no-rooms`.
- A room use is read whatever its capitals: `Bedroom` is `bedroom`.
- `grid check` and `grid_check` read the plan file as written, so they name these words. The
  edit tools' `toLookAt` counts the file as written, before and after: a change keeps a field
  Grid does not know, and it is counted on both sides.

### 2026-11-22: a fault stays local (MSG-6)

- A value Grid cannot read inside a wall, room, opening, floor or fixture no longer refuses the
  plan. Each line's `found` says the place and the value as read (`-0.3 at openings[1].offset`,
  `NaN, which JSON does not hold as a number at …`), and `needed` what the format takes there.
  The plan is read part by part: new codes `plan/part-left-out` (`left-out`),
  `plan/value-left-out` and `plan/read-as-meant` (`worth-a-look`). The record is `read: true`,
  and every check runs on the rest. Of the scoreboard's 3,000 damaged plans, the 504 the format
  refused are each read now, with the damaged value named by its part and place.
- New refusal `plan/unfinished-merge`: a file with git's conflict markers is named as an
  unfinished merge, with the line of the first conflict and what each side adds or changes, by
  id. `plan/not-json` now says the line and column where the text stops being JSON.
- New `plan/blank-id`, `plan/similar-id` and `plan/id-clash` (`left-out`). A room and a wall that
  share an id now leave out only the room; the rooms on the wall are measured. Before, both were
  left out with every room on the wall.
- `plan/duplicate-id` (two walls with one id) names how many parts share the id and an id to
  rename one to. `room/broken-wall` and `opening/broken-wall` name the wall when it was left out
  when the plan was read.
- The `plan/missing-field`, `plan/wrong-type`, `plan/unknown-word`, `plan/out-of-range` and
  `plan/not-in-format` refusals are now only given for the plan's top level.

### 2026-11-22: people kept out of hand-over files (HND-9)

- The server's instructions and the descriptions of `grid_write_rooms`, `grid_export` and
  `grid_sheet` say that room names and ids go into every export and sheet: never put a
  person's name in one. Who sits where belongs in `plan.occupancy.json` beside the plan, which
  no tool reads and no export carries. No answer changes.

### 2026-11-22: what is never looked at (COD-4)

- `limits` adds two lines: "Ceiling height is not checked, in any room or under a sloping
  roof" and "Which walls carry load is not known: the plan does not record it, so nothing here
  looks at structure". There are eight lines now. A ceiling-height check, when there is one,
  takes the first away.
- `grid_check` returns `limits` and ends its text with "Never looked at, whatever the plan (N):"
  and the lines.

### 2026-11-22: what each check looked at (MSG-2)

- The record adds `coverage`: for each check, the floors, rooms or doors it looked at and those
  it skipped, with the reason and a count (lab CH-1, CH-4).
- `checks` lists only the checks that looked at something, and `figures` only their figures. A
  plan whose rooms state no use no longer lists the room-size and escape checks as applied.
- Two new `not-checked` codes: `floor/not-checked-above-escape-storeys`, for the bedrooms of a
  floor above the third storey, which the escape check used to pass in silence, and
  `plan/not-checked-no-rooms`, for a plan with no rooms (`{}` among them).
- `grid check` prints "Looked at by at least one check: N of M rooms" and what each check
  looked at. `grid_check` returns `coverage`.
- `grid_areas` marks every area and total with a state, and names the rooms a total left out.
  See "Numbers and their state".

### 2026-11-22: MSG-18

- New finding `opening/too-small-to-pass`: a door or doorless opening narrower than 0.4 m,
  lower than 1.2 m, or with its sill more than 0.3 m above its floor is named and is no longer
  a way through. These are Grid's own sizes (`passableWidth`, `passableHeight`,
  `passableSill` in the tolerance table), not code figures. A room or floor that had only such
  an opening now also gets `room/no-door` or `floor/no-exit`. The finding carries `passage`:
  what it falls short of, its size there as drawn and the passable size.
- The limits line "Which way a door opens, and how wide doors and corridors are, are not
  checked" now ends ", beyond whether a person fits through a door at all".

### 2026-11-22: fixtures (CNT-12)

- A line can be about a fixture: `thing.kind` is `item`, its id the item's id, and `{thing}` its
  kind and id (`Toilet "wc1"`). Version 1 still: a kind of thing was added, none changed.
- New codes, all from the plan's `items`: `item/too-large`, `item/no-size`, `item/unknown-kind`,
  `item/duplicate-id` and `item/unknown-floor` leave the fixture out; `item/outside-rooms`,
  `item/into-wall` and `item/too-tall` are worth a look. A kind the plan does not hold yet (a
  table, a chair) is `item/unknown-kind`: the fixture is left out and nothing else changes.
- A refusal inside `items` names the item (`thing.kind` `item`) when its id can be read.

### 2026-11-22: what went wrong, on the drawing (MSG-8)

- No field changed. `grid check` and `grid_check` print each line's number, its place in
  `lines` from 1, in place of a dash; `grid check --json` adds `numbers`, each line's number,
  which on one floor is still its place in the whole record.
- `grid draw` and `grid_view` (kind plan) mark every line of the floor drawn with its number on
  its part, print its words beside the mark, and list the floor's lines under the drawing. A
  room that cannot be drawn is the dashed box round its walls with its name and the reason.

### 2026-11-22: stairs (LVL-3)

- New codes: `stair/unknown-floor`, `stair/same-floor`, `stair/no-rise`, `stair/run-too-short`,
  `stair/too-few-risers`, `stair/duplicate-id` (left out) and `stair/end-in-no-room` (worth a
  look), on a new thing kind `stair`; findings `room/stair-out-of-line` and `room/lift-out-of-line`.
- `floor/not-checked-no-stairs` now reads "no stair joins it to the ground floor": a floor a stair
  joins to the ground floor is checked down the stair.

### 2026-11-21: version 1 (MSG-1)

- `inspectPlan` and the record are new. `grid check` prints the record as one list, "To look
  at (N)", in place of the separate "Findings", "Not checked" and "Problems in the drawing"
  sections; door sweeps are in it for the first time. `grid check --json` adds `result`.
- `grid_check` returns `count` and `lines`; its text leads with "To look at". It keeps
  `findings`, `notChecked` and `drawing`, which a later version may remove.
- The edit tools' receipts add `toLookAt`.
- The plan-only check in `@ongrid/floorplan` is now `checkPlanSanity`. Only `@ongrid/rules`
  exports `checkLocalRules`, so importing the wrong one no longer compiles.
- Notes a person reads now carry the report's wording as their title ("has no route to a
  door to the outside", no longer "has no way out").
- Codes from LVL-1 and LVL-7 have their entries: `plan/level-gap`, `plan/same-level`,
  `wall/above-storey`, `room/offset-question`, `floor/empty-top`, `floor/size-question` and
  the finding `opening/door-out-above-ground`. `plan/same-level` is about the floor it names.
- Two notices have one wording for one room or many: "On "Ground floor", rooms that could not
  be drawn were not checked: …" and "On "Ground floor", room sizes were not checked in rooms
  with no use stated: N".
