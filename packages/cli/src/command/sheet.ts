/**
 * `grid sheet <plan> --layout client|check`: the plan as an A3 PDF for people (VEW-7), or
 * `--layout drawing` (`--scale 1:100 --paper A4`): one floor at a true scale as a PDF, an SVG
 * and a PNG (SHT-6). The work is in `src/sheet/`; this file holds the options.
 */
import { LANG_OPTION } from './language'
import { PROJECT_OPTION, type OptionSpecs } from './options'

export const SHEET_OPTIONS: OptionSpecs = {
  '--layout': { takesValue: true, help: 'client (a presentation, with the words of sheet.json), check (a working set with ids and findings) or drawing (one floor at a true scale; --scale or --paper alone means it).' },
  '--sheet': { takesValue: true, help: 'Client and drawing: the words, as a sheet.json file inside the project (a drawing takes its name). sheet.json beside the plan when left out.' },
  '--scale': { takesValue: true, help: 'Drawing: 1:N, such as 1:50, 1:100 or 1:200. The largest of 1:100, 1:200 and 1:500 the floor fits when left out.' },
  '--paper': { takesValue: true, help: 'Drawing: A4, A3, A2, A1 or A0, turned the way the floor fits. The smallest that fits when left out.' },
  '--floor': { takesValue: true, help: 'Drawing: the floor to draw (a floor id from the plan). The ground floor when left out.' },
  '--room-sizes': { takesValue: true, help: "Drawing: on or off, each room's width and depth along its walls. on when left out." },
  '--out': { takesValue: true, help: 'The PDF to write, inside the project (a drawing writes its SVG and PNG beside it). exports/ beside the plan when left out.' },
  ...LANG_OPTION,
  ...PROJECT_OPTION,
}
