# 2026-11-26: a section is drawn in the technical look unless asked otherwise (VEW-60)

## For people

- A section drawn through the tool server is now black on white with lines in millimetres, as
  `grid draw --section` already drew it, instead of the working look with near-black wall fills.
  Ask for `look` working to get the old picture (VEW-60).

## For agents

- `grid_view kind=section` draws in the technical look when `look` is left out, and the answer
  says `technical`. The description of `look` now names sections: it applies to plan, facade and
  section. A plan and a facade still default to working. No new code in the record.
