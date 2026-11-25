# 2026-11-25: Simplified Chinese names draw as glyphs in every picture (VEW-21)

## For people

- A room named in Simplified Chinese, such as 厅, 卫生间 or 储藏室, now draws as its characters in
  PNG pictures and on the sheet's plan. Before, characters used only in Simplified Chinese came out
  as boxes because a Japanese face was tried first. Names with kana still use the Japanese face
  (VEW-21).

## For agents

- `grid_view`, `grid_draw` and the plan on `grid_sheet` pick a Chinese face first for Han text with
  no kana or Hangul in it, so Simplified-only characters are no longer boxes. The SVG file is
  unchanged. No new code in the record.
