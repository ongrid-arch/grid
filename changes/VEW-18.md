# 2026-11-25: Arabic and Hebrew names draw as letters on plans and sheets (VEW-18)

## For people

- A room named in Arabic or Hebrew now draws as its letters in a PNG of a plan and on the sheet's
  PDF, on any machine, instead of a row of empty boxes. The letters are joined and read right to
  left, and a name that mixes in Latin text or numbers keeps those in reading order. Grid ships
  Noto Sans Arabic and Noto Sans Hebrew (SIL Open Font License 1.1) for it, in the `fonts/`
  folder beside the sheet's fonts, so no system font is needed. The SVG file is unchanged
  (VEW-18).

## For agents

- No change to what a tool answers: only the pixels of a PNG or a sheet's PDF with a name in
  Arabic or Hebrew. No new code in the record.
