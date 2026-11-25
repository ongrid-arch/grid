# 2026-11-25: the roof drawn in every 3D still (VEW-19)

## For people

- A 3D picture of a plan now has the roof its GLB has. A one-storey plan with a gable, hip,
  mono-pitch or flat roof stated on its floor is drawn with that roof, and any plan seen from
  outside is drawn closed, with a flat roof over every part with nothing above and no stated
  roof. A floor cut away is still drawn open, so its rooms can be seen. This holds for
  `grid draw`, the sheet's still and the pictures an agent gets (VEW-19).

## For agents

- `grid_view kind=3d` takes `roof`: `show` or `hide`. Left out, the roof is shown from a camera
  outside every room or when a floor states its roof, and hidden with a floor cut away. Its answer
  no longer says "The model has no roof" over a picture of one: it names the stated roof by shape
  and floor ("It is drawn with the roof the plan states, a gable roof over …"), says every part
  with nothing above has a flat roof, or says the model is drawn open, without its roof, and that
  `roof=show` draws it. `roof` on another kind is refused by name. `kind=eye` is unchanged. No new
  code in the record.
