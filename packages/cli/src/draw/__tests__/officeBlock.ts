/**
 * SHT-25: an office block of a few hundred walls, for timing pictures and sheets: `floors` floors of
 * `across` by `deep` offices of 4 m by 4 m, each column of rooms set off from the next so their
 * walls do not line up, each office with a window on its south side. Written as rooms text.
 */
import { expect } from 'vitest'
import { validatePlan } from '@ongrid/floorplan/geometry'
import { compileRoomsText } from '@ongrid/floorplan/rooms'
import { parseFloorPlan } from '@ongrid/floorplan/types/floorplan'
import type { LoadedPlan } from '../../command/plan'

export function officeBlock(floors: number, across = 14, deep = 10): LoadedPlan {
  const lines = ['plan "Block"', 'building office', 'walls outside 0.3 inside 0.1 height 2.9']
  for (let f = 0; f < floors; f++) {
    lines.push(`floor l${f} "Level ${f}" level ${f} elevation ${(f * 3.2).toFixed(1)} height 2.9`)
    for (let i = 0; i < across; i++) {
      for (let j = 0; j < deep; j++) {
        lines.push(`room r${f}_${i}_${j} "Office" office 4 x 4 at ${(i * 4.1).toFixed(1)},${(j * 4.1 + (i % 3) * 1.3).toFixed(1)}`)
        lines.push(`window w${f}_${i}_${j} in r${f}_${i}_${j} south, centred, 1.2 wide`)
      }
    }
  }
  const result = compileRoomsText(lines.join('\n') + '\n')
  expect(result.problems).toEqual([])
  const plan = parseFloorPlan(result.plan)
  const { issues, broken } = validatePlan(plan)
  return { file: 'block.json', plan, issues, broken }
}
