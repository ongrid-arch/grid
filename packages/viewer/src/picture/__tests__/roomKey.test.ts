import { describe, expect, it } from 'vitest'
import { buildFloorPlan, rectInsidePolygon } from '@ongrid/floorplan/geometry'
import { compileRoomsText } from '@ongrid/floorplan/rooms'
import type { FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { TEXT_PX } from '../look'
import { formBox } from '../../canvas2d/labelPlacement'
import { planPicture } from '../planSvg'
import { roomKeyOf } from '../scene'
import type { SvgNode } from '../svgNode'
import { numberRuns } from '../writing'

/**
 * VEW-13: a row of small equal rooms, each too small for its name at the picture's size. Each
 * carries its number in the room, and the key under the drawing names them.
 */

function units(count: number, size: number, extra = ''): FloorPlan {
  const lines = ['walls outside 0.3 inside 0.1 height 2.6']
  for (let i = 1; i <= count; i++) lines.push(`room u${i} "Storage unit" - ${size} x ${size}${i === 1 ? '' : ` east of u${i - 1}`}`)
  if (extra !== '') lines.push(extra)
  const written = compileRoomsText(lines.join('\n'))
  expect(written.problems).toEqual([])
  return written.plan as FloorPlan
}

const textOf = (node: SvgNode | string | undefined): string =>
  node === undefined ? '' : typeof node === 'string' ? node : node.children.map(textOf).join('')

describe('the room key (VEW-13)', () => {
  it('numbers small rooms in their own rooms and keys them under the drawing', () => {
    const plan = units(24, 1.2)
    const picture = planPicture(plan, { width: 800 })
    const mpp = picture.view.width / picture.width
    const rooms = buildFloorPlan(plan).rooms
    expect(picture.nodes.some((node) => node.key?.startsWith('leader:') === true)).toBe(false)
    const keyed = roomKeyOf(picture.nodes)
    expect(keyed).toHaveLength(24)
    expect(keyed.map((room) => room.number)).toEqual(rooms.map((_, i) => String(i + 1)))
    for (const node of picture.nodes.filter((part) => part.key?.startsWith('label:') === true)) {
      const room = rooms.find((r) => `label:${r.id}` === node.key)!
      const [x, y] = /translate\((\S+) (\S+)\)/.exec(String(node.attrs.transform))!.slice(1).map(Number)
      const name = (node.children as SvgNode[])[0]!
      const scale = Number(name.attrs['font-size']) / TEXT_PX.roomName
      const box = formBox({ names: [textOf(name)], area: null, scale, turned: false, keyed: true }, { x: x!, y: -y! }, mpp)
      expect(rectInsidePolygon(box, room.polygon)).toBe(true)
    }
    const entries = (picture.key?.nodes ?? []).filter((node) => node.attrs['data-part'] === 'room-key-entry').map(textOf)
    expect(entries).toEqual(['1–24 Storage unit'])
    expect((picture.key?.nodes ?? []).some((node) => node.attrs['data-part'] === 'room-key-title' && textOf(node) === 'Rooms')).toBe(true)
  })

  it('draws no room key when every name fits, or when the key is turned off', () => {
    expect(planPicture(units(3, 4), { width: 800 }).key).toBeNull()
    const off = planPicture(units(24, 1.2), { width: 800, show: { key: false } })
    expect((off.key?.nodes ?? []).some((node) => node.attrs['data-part'] === 'room-key-entry')).toBe(false)
  })

  it('writes the numbers in runs', () => {
    expect(numberRuns(['1', '2', '3', '5', '6', 'B4', '9'])).toEqual('1–3, 5, 6, B4, 9')
  })
})
