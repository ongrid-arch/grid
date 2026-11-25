# 2026-11-25: the roof the plan states is named in grid_view's text and answers (CMD-23)

## For people

- A pitched roof the plan holds is no longer described as flat: the tool text and the answers of
  the 3d and facade views name the roof each floor states (a hip, a gable, a mono-pitch roof, with
  its pitch), and say a flat roof is taken only where the plan states none (CMD-23).

## For agents

- `grid_view`'s description says the 3d model and the facade draw the roof each floor states
  (flat, mono-pitch, gable or hip), and flat only where none is stated. Its 3d answer names each
  stated roof with its pitch or ridge, drawn or hidden (hidden, it says `roof=show` draws it). Its
  facade answer gains one sentence naming the stated roof, or saying the plan states none. No new
  code in the record.
