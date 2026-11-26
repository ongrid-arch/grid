# 2026-11-26: floors copied turned, moved or scaled, and repeated so (LVL-22)

## For people

- In rooms text, `copy <floor>` can turn, move and scale the floor it copies:
  `copy f00 with openings turn 15 about 4,4 move 0.5,0 scale 0.95`. The rooms keep their areas
  (or are scaled), the walls keep their thickness, and doors and windows stay on the same sides
  of the same rooms. A room that rises `through` floors stays where it is (LVL-22).
- `repeat floors 39 from f00 with openings turn 2 rise 3.4` writes a 40-storey tower twisting 2°
  a floor in one line: `f01` to `f39`, each turned, moved and scaled once more than the one below
  and 3.4 m higher. The plan file holds every floor written out, with the same ids every time.

## For agents

- Rooms text: `copy <floor> [with openings] [turn <deg> [clockwise]] [about x,y] [move dx,dy]
  [scale <s>]` and `repeat floors <n> from <floor> [as <first id>] [with openings] [turn <deg>
  [clockwise]] [about x,y] [move dx,dy] [scale <s>] [rise <m>]` (at most 200 floors). A turn is in
  degrees counter-clockwise unless `clockwise` follows; it is about `about`, else the middle of the
  box round the floor's rooms; the scale is about the same point and the move comes last. Ids
  count up from the floor's digits (`f00`: `f01`, `f02` ...), or from `as`. A word the copy does
  not know, a `turn` with no degrees or a repeat of more than 200 floors is refused as
  `rooms/syntax` with the form; an id the repeat would write that is already written is
  `rooms/duplicate-id`. The answer's notes say what a repeat wrote. The `floors` topic of the rooms
  grammar names the new words and a new `turned floors` topic teaches them.
- New warning `rooms/turned-roof`: a floor copied with a turn other than by quarter turns from a
  floor with a sloped roof keeps the roof as laid along the drawing's sides, and says so.
