/**
 * LVL-9: `grid_view kind=section`'s answer: the section's picture, and in words and data its
 * line, levels, room heights and what it takes that the plan does not state. Loaded only when a
 * section is asked for.
 */
import type { FloorPlan } from '@ongrid/floorplan/geometry'
import { levelText, type SectionLine } from '@ongrid/floorplan/geometry/section'
import { sectionView } from '../draw/views'
import { namedLook, type LookName } from '../draw/viewNames'
import { m, type Answer } from './toolkit'
import type { Display } from '@ongrid/floorplan/types/units'
import type { Language } from '@ongrid/floorplan/messages'

const q = (text: string): string => JSON.stringify(text)
const count = (n: number, one: string): string => `${n} ${one}${n === 1 ? '' : 's'}`

/** MSG-11: the picture's own words are in `language`; the answer's text stays the tool's English, as a facade's does. */
export async function sectionAnswer(plan: FloorPlan, line: SectionLine, asked: LookName, language?: Language, display?: Display): Promise<Answer> {
  const look = asked === namedLook(asked) ? asked : `${namedLook(asked)} (asked as ${asked})`
  const view = await sectionView(plan, line, asked, language, display)
  const { section } = view
  const walls = section.parts.filter((p) => p.kind === 'wall').length
  const stairs = section.parts.filter((p) => p.kind === 'stair').length
  const lines = [
    `Section from (${m(line.from.x)}, ${m(line.from.y)}) to (${m(line.to.x)}, ${m(line.to.y)}), looking to the ${line.toward} of the line, ${look}: ${view.width} × ${view.height} px, 1 m = ${view.pxPerMetre.toFixed(1)} px. Across the picture, x runs from its left; levels and heights are in ${display?.length ?? plan.display?.length ?? 'm'} from the ground floor's floor level (the data below is in metres). Look at the picture before you describe it.`,
    section.parts.length === 0
      ? 'The line cuts nothing of the building: draw it across the walls.'
      : `It cuts ${count(walls, 'wall')}${stairs > 0 ? `, ${count(stairs, 'stair')}` : ''} and ${count(section.rooms.length, 'room')}; the cut parts join into ${count(section.cut.length, 'shape')}.`,
    `Levels: ${section.levels.map((l) => `${q(l.name || l.floor)} ${levelText(l.level, display)}${l.source === 'worked-out' ? ' (worked out)' : ''}`).join(', ')}${section.roofs.length === 0 ? '' : `; roof ${section.roofs.map((r) => levelText(r.level, display)).join(', ')}`}; ground ${levelText(section.ground.level, display)}${section.ground.stated ? '' : ' (not stated)'}.`,
    ...(section.rooms.length === 0 ? [] : [`Rooms cut, floor to ceiling: ${section.rooms.map((r) => `${q(r.name || r.room)} ${m(r.height)} m${r.heightStated ? '' : ' (not stated)'}`).join(', ')}.`]),
    ...(section.assumed.length === 0 ? [] : ['Taken by Grid, not stated in the plan (hatched on the drawing where marked so, and listed under it):', ...section.assumed.map((a) => `  ${a.hatched ? 'hatched' : 'listed'}: ${a.words}`)]),
  ]
  return {
    text: lines.join('\n'),
    data: {
      kind: 'section', floor: null, camera: null, view: null, pxPerMetre: view.pxPerMetre, sills: [], ids: [], boxes: [],
      section: {
        line: { from: [line.from.x, line.from.y], to: [line.to.x, line.to.y], toward: line.toward },
        levels: section.levels,
        roofs: section.roofs,
        ground: { level: section.ground.level, stated: section.ground.stated },
        rooms: section.rooms.map((r) => ({ room: r.room, floor: r.floor, name: r.name, floorLevel: r.floorLevel, height: r.height, heightStated: r.heightStated })),
        cut: section.parts.map((p) => ({ kind: p.kind, id: p.id, floor: p.floor })),
        shapes: section.cut.length,
        assumed: section.assumed.map((a) => ({ kind: a.kind, ids: a.ids, words: a.words, hatched: a.hatched })),
      },
    },
    image: { data: view.png, mimeType: 'image/png' },
  }
}
