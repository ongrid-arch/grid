/**
 * `grid sheet <plan> --layout client|check`: the plan as an A3 PDF for people (VEW-7), or
 * `--layout drawing` (`--scale 1:100 --paper A4`): every floor, or one, at a true scale as a PDF,
 * an SVG and a PNG (SHT-6, SHT-20). The work is in `src/sheet/`; this file holds the options.
 */
import { LANG_OPTION } from './language'
import { PROJECT_OPTION, type OptionSpecs } from './options'

export const SHEET_OPTIONS: OptionSpecs = {
  '--layout': { takesValue: true, help: 'client (a presentation, with the words of <plan>.sheet.json; when left out), check (a working set with ids and findings), access (the access measurements drawn on each floor, then their tables against your own figures from the brief) or drawing (one floor at a true scale; --scale or --paper alone means it).' },
  '--sheet': { takesValue: true, help: 'Client and drawing: the words, as a sheet.json file inside the project (a drawing takes its name). <plan>.sheet.json beside the plan when left out.' },
  '--scale': { takesValue: true, help: 'Drawing: 1:N, such as 1:50, 1:100 or 1:200. The largest of 1:100, 1:200 and 1:500 the floor fits when left out.' },
  '--paper': { takesValue: true, help: 'Drawing: A4, A3, A2, A1 or A0, turned the way the floor fits. The smallest that fits when left out.' },
  '--floor': { takesValue: true, help: 'Drawing: the floor to draw (a floor id from the plan). Every floor, one page each at one scale and paper, when left out.' },
  '--split': { takesValue: false, help: 'Drawing: a floor too large for the paper at the scale is cut over pages at that scale, each part with a dashed line where the next continues. A0 when no --paper is given.' },
  '--room-sizes': { takesValue: true, help: "Drawing: on or off, each room's width and depth along its walls. on when left out." },
  '--out': { takesValue: true, help: 'The PDF to write, inside the project (a drawing writes its SVG and PNG beside it). exports/ beside the plan when left out.' },
  '--date': { takesValue: true, help: 'The date on the sheet, a date (2026-01-31) or a time (2026-01-31T09:00:00Z). SOURCE_DATE_EPOCH when left out, else today. The same date gives the same file.' },
  ...LANG_OPTION,
  ...PROJECT_OPTION,
}
