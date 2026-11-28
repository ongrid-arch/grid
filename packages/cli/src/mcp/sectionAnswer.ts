/**
 * LVL-9: `grid_view kind=section`'s answer: the section's picture, and in words and data its
 * line, levels, room heights and what it takes that the plan does not state. Loaded only when a
 * section is asked for.
 */
import type { PixelTransform } from '../draw/pictureTransform'
import type { FloorPlan } from '@ongrid/floorplan/geometry'
import { levelText, sectionGroundLine, type PlanSection, type SectionLine } from '@ongrid/floorplan/geometry/section'
import type { SectionChain } from '@ongrid/floorplan/geometry/sectionDimensions'
import { sectionView, type PictureSize } from '../draw/views'
import { drawingLook, type LookName } from '../draw/viewNames'
import { m, type Answer } from './toolkit'
import type { Display } from '@ongrid/floorplan/types/units'
import { DEFAULT_LANGUAGE, say, type Language } from '@ongrid/floorplan/messages'

const q = (text: string): string => JSON.stringify(text)
const count = (n: number, one: string): string => `${n} ${one}${n === 1 ? '' : 's'}`

/** VEW-86: the ground along the line through the spot levels the site states, in words. */
function profileWords(section: PlanSection, display?: Display): string {
  const zs = sectionGroundLine(section.ground, 0, section.length).map(([, z]) => z)
  return `from ${levelText(zs[0]!, display)} to ${levelText(zs.at(-1)!, display)} along the line, lowest ${levelText(Math.min(...zs), display)}, highest ${levelText(Math.max(...zs), display)}, through the spot levels the site states`
}

/**
 * VEW-89: the dimension chains in one line each: kind, figures in order with their sum, and what
 * each point is at (kind and id), bottom up on the left, left to right under the cut.
 */
function chainLines(chains: readonly SectionChain[]): string[] {
  if (chains.length === 0) return []
  const line = (c: SectionChain): string => {
    const total = c.dimensions.reduce((sum, d) => sum + d.value, 0)
    const points = [c.dimensions[0]!.ends[0], ...c.dimensions.map((d) => d.ends[1])].map((e) => (e.id === '' ? e.kind : `${e.kind} ${e.id}`))
    return `  ${c.kind}: ${c.dimensions.map((d) => m(d.value)).join(' + ')}${c.dimensions.length > 1 ? ` = ${m(total)}` : ''} m (${points.join(', ')})`
  }
  return ['Dimension chains, in metres, up the left side from the bottom and under the cut from the left:', ...chains.map(line)]
}

/** MSG-11: the picture's own words are in `language`; the answer's text stays the tool's English, as a facade's does. */
export async function sectionAnswer(plan: FloorPlan, line: SectionLine, asked: LookName, language?: Language, display?: Display, size?: PictureSize, dimensions = true): Promise<Answer & { readonly image: NonNullable<Answer['image']>; readonly picture: { readonly svg?: () => string; readonly bounds: null; readonly pixelToMetres?: PixelTransform } }> {
  const look = asked === drawingLook(asked) ? asked : `${drawingLook(asked)} (asked as ${asked})`
  const view = await sectionView(plan, line, asked, language, display, size, dimensions)
  const { section, chains } = view
  const walls = section.parts.filter((p) => p.kind === 'wall').length
  const stairs = section.parts.filter((p) => p.kind === 'stair').length
  const lines = [
    `Section from (${m(line.from.x)}, ${m(line.from.y)}) to (${m(line.to.x)}, ${m(line.to.y)}), looking to the ${line.toward} of the line, ${look}: ${view.width} × ${view.height} px, 1 m = ${view.pxPerMetre.toFixed(1)} px. Across the picture, x runs from its left; levels and heights are in ${display?.length ?? plan.display?.length ?? 'm'} from the ground floor's floor level (the data below is in metres). Look at the picture before you describe it.`,
    section.parts.length === 0
      ? 'The line cuts nothing of the building: draw it across the walls.'
      : `It cuts ${count(walls, 'wall')}${stairs > 0 ? `, ${count(stairs, 'stair')}` : ''} and ${count(section.rooms.length, 'room')}; the cut parts join into ${count(section.cut.length, 'shape')}.`,
    ...(section.reach.startInside ? [say(DEFAULT_LANGUAGE, 'drawing.section.reach.startInside')] : []),
    ...(section.reach.endInside ? [say(DEFAULT_LANGUAGE, 'drawing.section.reach.endInside')] : []),
    `Levels: ${section.levels.map((l) => `${q(l.name || l.floor)} ${levelText(l.level, display)}${l.source === 'worked-out' ? ' (worked out)' : ''}`).join(', ')}${section.roofs.length === 0 ? '' : `; roof ${section.roofs.map((r) => levelText(r.level, display)).join(', ')}`}; ground ${section.ground.profile !== undefined ? profileWords(section, display) : section.ground.fall === undefined ? levelText(section.ground.level, display) : `from ${levelText(section.ground.fall.at, display)} to ${levelText(section.ground.fall.at + section.ground.fall.perMetre * section.length, display)} along the line, on the slope the site states`}${section.ground.stated ? '' : ' (not stated)'}.`,
    ...(section.rooms.length === 0 ? [] : [`Rooms cut, floor to ceiling: ${section.rooms.map((r) => `${q(r.name || r.room)} ${m(r.height)} m${r.heightStated ? '' : ' (not stated)'}`).join(', ')}.`]),
    ...chainLines(chains),
    ...(section.assumed.length === 0 ? [] : ['Taken by Grid, not stated in the plan (dashed on the drawing where marked so, and listed under it):', ...section.assumed.map((a) => `  ${a.hatched ? 'dashed' : 'listed'}: ${a.words}${a.kind === 'ground' ? ` ${say(DEFAULT_LANGUAGE, 'site.ground.how')}` : ''}`)]),
  ]
  return {
    text: lines.join('\n'),
    data: {
      kind: 'section', floor: null, camera: null, view: null, pxPerMetre: view.pxPerMetre, sills: [], ids: [], boxes: [],
      section: {
        line: { from: [line.from.x, line.from.y], to: [line.to.x, line.to.y], toward: line.toward },
        levels: section.levels,
        roofs: section.roofs,
        // VEW-65: how deep the earth is drawn, and the walls cut below the ground that hold it back.
        ground: { level: section.ground.level, stated: section.ground.stated, ...(section.ground.fall === undefined ? {} : { fall: section.ground.fall }), ...(section.ground.profile === undefined ? {} : { profile: section.ground.profile }), earthBottom: section.ground.earth.bottom, retaining: section.parts.filter((p) => p.retaining === true).map((p) => p.id) },
        rooms: section.rooms.map((r) => ({ room: r.room, floor: r.floor, name: r.name, floorLevel: r.floorLevel, height: r.height, heightStated: r.heightStated })),
        cut: section.parts.map((p) => ({ kind: p.kind, id: p.id, floor: p.floor })),
        shapes: section.cut.length,
        reach: section.reach,
        assumed: section.assumed.map((a) => ({ kind: a.kind, ids: a.ids, words: a.words, hatched: a.hatched })),
        // VEW-89: the chains drawn, each figure from and to (a level up the side, an x along the cut) with what each end is at.
        openings: section.openings,
        dimensions: chains.map((c) => ({ kind: c.kind, axis: c.axis, figures: c.dimensions.map((d) => (c.axis === 'vertical' ? { value: d.value, from: d.from.y, to: d.to.y, ends: d.ends } : { value: d.value, from: d.from.x, to: d.to.x, ends: d.ends })) })),
      },
    },
    image: { data: view.png, mimeType: 'image/png' },
    picture: { ...(view.svg === undefined ? {} : { svg: view.svg }), bounds: null, pixelToMetres: view.pixelToMetres },
  }
}
