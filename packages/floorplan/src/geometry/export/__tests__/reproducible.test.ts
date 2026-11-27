import { describe, expect, it } from 'vitest'
import { buildFloorPlan } from '../../floorplan'
import { parseFloorPlan, type FloorPlan } from '../../../types/floorplan'
import { toDxf } from '../dxf'
import { toIfc } from '../ifc'
import { exportPlan } from '../../../export/planExport'
import { parseDoc, ofType, only, str } from './step-reader'

/** CMD-26: names, the doors' and windows' sets, and the DXF's circle and curved-wall block names. */

const room = (extra: Partial<FloorPlan> = {}): FloorPlan => ({
  version: '1',
  units: 'm',
  walls: [
    { id: 'w1', start: [0, 0], end: [4, 0], thickness: 0.2, height: 2.7, kind: 'exterior' },
    { id: 'w2', start: [4, 0], end: [4, 3], thickness: 0.2, height: 2.7, kind: 'exterior' },
    { id: 'w3', start: [4, 3], end: [0, 3], thickness: 0.2, height: 2.7, kind: 'exterior' },
    { id: 'w4', start: [0, 3], end: [0, 0], thickness: 0.2, height: 2.7, kind: 'exterior' }
  ],
  rooms: [{ id: 'r1', name: 'Living room', boundary: ['w1', 'w2', 'w3', 'w4'] }],
  openings: [
    { id: 'o1', wall: 'w1', type: 'door', offset: 1.5, width: 0.9, sill: 0, height: 2.1 },
    { id: 'o2', wall: 'w3', type: 'window', offset: 1, width: 1.2, sill: 0.9, height: 1.2 }
  ],
  ...extra
})

describe('IFC names and sets (CMD-26)', () => {
  it('names the project and the building from the plan', () => {
    const doc = parseDoc(toIfc(room({ name: 'Casa \u{1F600}' }), { projectName: 'plan' }))
    expect(str(only(doc, 'IFCPROJECT').args[2])).toBe('Casa \u{1F600}')
    expect(str(only(doc, 'IFCBUILDING').args[2])).toBe('Casa \u{1F600}')
  })

  it('names the building by its own name when the plan has one building', () => {
    const doc = parseDoc(toIfc(room({ buildings: [{ id: 'b1', name: 'Annex', floors: ['ground'] }] })))
    expect(str(only(doc, 'IFCBUILDING').args[2])).toBe('Annex')
  })

  it('falls back to the plan title for the project, then to the file name', () => {
    const titled = exportPlan(room({ title: 'Villa Rosa' }), 'ifc', { projectId: 'p', projectName: 'plan', now: new Date(0) })
    expect(titled.data).toContain("IFCPROJECT('")
    expect(parseDoc(titled.data as string)).toBeDefined()
    expect(str(only(parseDoc(titled.data as string), 'IFCPROJECT').args[2])).toBe('Villa Rosa')
    const bare = exportPlan(room(), 'ifc', { projectId: 'p', projectName: 'plan', now: new Date(0) })
    expect(str(only(parseDoc(bare.data as string), 'IFCPROJECT').args[2])).toBe('plan')
  })

  it('writes the door and the window with a tag and their common sets', () => {
    const text = toIfc(room(), { projectId: 'p' })
    const doc = parseDoc(text)
    const door = only(doc, 'IFCDOOR')
    const window = only(doc, 'IFCWINDOW')
    expect(str(door.args[7])).toBe('o1')
    expect(str(window.args[7])).toBe('o2')
    const sets = ofType(doc, 'IFCPROPERTYSET').map((s) => str(s.args[2]))
    expect(sets).toContain('Pset_DoorCommon')
    expect(sets).toContain('Pset_WindowCommon')
    expect(text).toContain("IFCIDENTIFIER('o1')")
    expect(text).toMatch(/IFCPROPERTYSINGLEVALUE\('IsExternal',\$,IFCBOOLEAN\(\.T\.\),\$\)/)
  })

  it('writes the same bytes twice with the same time', () => {
    const when = new Date('2026-01-31T00:00:00Z')
    expect(toIfc(room(), { projectId: 'p', timestamp: when })).toBe(toIfc(room(), { projectId: 'p', timestamp: when }))
  })
})

describe('DXF circle and curved-wall blocks (CMD-26)', () => {
  it('writes a 360 degree sketch arc as a CIRCLE', () => {
    const plan = parseFloorPlan({
      ...room(),
      sketch: [{ id: 's1', kind: 'arc', category: 'notes', at: [2, 1.5], radius: 1, start: 0, end: 360 }]
    })
    const dxf = toDxf(buildFloorPlan(plan))
    expect(dxf).toContain('\r\nCIRCLE\r\n')
    expect(dxf).not.toContain('\r\nARC\r\n')
  })

  it('keeps a part arc an ARC', () => {
    const plan = parseFloorPlan({
      ...room(),
      sketch: [{ id: 's1', kind: 'arc', category: 'notes', at: [2, 1.5], radius: 1, start: 0, end: 90 }]
    })
    expect(toDxf(buildFloorPlan(plan))).toContain('\r\nARC\r\n')
  })

  it('names a block on a curved wall by its stated width, not its chord', () => {
    const plan = parseFloorPlan({
      version: '1',
      units: 'm',
      walls: [{ id: 'bay', start: [4, 3], end: [0, 3], thickness: 0.2, height: 2.7, kind: 'exterior', arc: { centre: [2, 3], sweep: 180 } }],
      rooms: [],
      openings: [{ id: 'd1', wall: 'bay', type: 'door', offset: 2, width: 1.5, sill: 0, height: 2.1 }]
    })
    const dxf = toDxf(buildFloorPlan(plan))
    expect(dxf).toContain('GRID-DOOR-1500x2100-W200')
  })
})
