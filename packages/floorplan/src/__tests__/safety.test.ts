/**
 * What held when the lab tried to break Grid on purpose (lab entry T-9, which repeats EX-9 and
 * SC-1): hostile names in the exports, deep nesting, ids named like the parts of every object,
 * and very many openings on one wall. A plan file is often written by an assistant, so its text
 * is not to be trusted.
 */
import { describe, expect, it } from 'vitest'
import { diffPlans, validatePlan } from '../geometry'
import { exportPlan, type ExportFormat } from '../export/planExport'
import { parseFloorPlan, type FloorPlan } from '../types/floorplan'
import { checkPlanSanity } from '../geometry/rules/check'

const NOW = new Date('2026-11-17T00:00:00Z')

function box(roomName: string, extra: Record<string, unknown> = {}, ids = ['s', 'e', 'n', 'w']): Record<string, unknown> {
  return {
    version: '1',
    units: 'm',
    walls: [
      { id: ids[0], start: [0, 0], end: [4, 0], kind: 'exterior' },
      { id: ids[1], start: [4, 0], end: [4, 3], kind: 'exterior' },
      { id: ids[2], start: [4, 3], end: [0, 3], kind: 'exterior' },
      { id: ids[3], start: [0, 3], end: [0, 0], kind: 'exterior' },
    ],
    rooms: [{ id: 'r1', name: roomName, use: 'bedroom', boundary: ids }],
    openings: [],
    ...extra,
  }
}

const text = (plan: FloorPlan, format: ExportFormat, projectName = 'p'): string => {
  const data = exportPlan(plan, format, { projectId: 'p', projectName, now: NOW }).data
  return typeof data === 'string' ? data : new TextDecoder().decode(data)
}

describe('names written to look like markup, file syntax or control characters', () => {
  const MARKUP = '</text><script>alert(1)</script><text onload="x">&amp; "q" \u0001\u000c\u202eevil'
  const FORGED_OBJ = 's\nv 9 9 9\nmtllib evil.mtl'
  const FORGED_IFC = "x');\nENDSEC;\n0\nSECTION"
  const plain = parseFloorPlan(box('Bedroom'))
  // Since MSG-9 the schema refuses this plan on reading (a line break in a wall id, control and
  // direction characters in a name). A library caller can still hand the writers a plan it built
  // without reading it, so the writers keep their own guard: the hostile text is put in after
  // the read.
  const hostile: FloorPlan = (() => {
    const read = parseFloorPlan(box('Bedroom', {}, ['tmp', 'e', 'n', 'w']))
    return {
      ...read,
      walls: read.walls.map((w) => (w.id === 'tmp' ? { ...w, id: FORGED_OBJ } : w)),
      rooms: read.rooms.map((r) => ({ ...r, name: MARKUP, boundary: r.boundary.map((id) => (id === 'tmp' ? FORGED_OBJ : id)) })),
    }
  })()

  it('are refused when the plan is read, naming the part (MSG-9)', () => {
    expect(() => parseFloorPlan(box(MARKUP, {}, [FORGED_OBJ, 'e', 'n', 'w']))).toThrow(/holds a line break \(U\+000A\)/)
  })

  it('stay one name in OBJ and GLB: the forged lines become part of a safe object name', () => {
    const obj = text(hostile, 'obj').split('\n')
    expect(obj).not.toContain('v 9 9 9')
    // VEW-73: the one mtllib line is Grid's own, naming the materials file beside the OBJ.
    expect(obj.filter((line) => line.startsWith('mtllib'))).toEqual(['mtllib grid.mtl'])
    expect(obj.join('\n')).toContain('wall_s_v_9_9_9_mtllib_evil.mtl')
    expect(text(hostile, 'glb')).toContain('wall_s_v_9_9_9_mtllib_evil.mtl')
  })

  it('stay inside their quotes in IFC: no section ends early', () => {
    const count = (ifc: string): number => ifc.split('\n').filter((line) => line.trim() === 'ENDSEC;').length
    expect(count(text(hostile, 'ifc', FORGED_IFC))).toBe(count(text(plain, 'ifc')))
  })

  it('lose their control characters in DXF and IFC', () => {
    for (const format of ['dxf', 'ifc'] as const) {
      expect(text(hostile, format, FORGED_IFC), format).not.toMatch(/[\u0001\u000c]/)
    }
  })
})

describe('input that is very large or oddly named', () => {
  it('refuses 100,000 levels of nesting with an ordinary schema error, quickly', () => {
    const raw = JSON.parse(`{"walls":${'['.repeat(100_000)}${']'.repeat(100_000)}}`) as unknown
    const start = performance.now()
    expect(() => parseFloorPlan(raw)).toThrow()
    expect(performance.now() - start).toBeLessThan(2000)
  })

  it('checks 20,000 overlapping windows on one wall: one issue for each window after the first', () => {
    const openings = Array.from({ length: 20_000 }, (_, i) => ({ id: `o${i}`, wall: 's', type: 'window', offset: 0.5, width: 1, sill: 0.9, height: 1 }))
    const plan = parseFloorPlan(box('R', { openings }))
    const start = performance.now()
    expect(validatePlan(plan).issues).toHaveLength(19_999)
    expect(performance.now() - start).toBeLessThan(5000)
  })

  it('validates, checks, compares and exports ids named like the parts of every object', () => {
    const ids = ['__proto__', 'constructor', 'toString', 'hasOwnProperty']
    const raw = JSON.parse(JSON.stringify(box('R', { floors: [{ id: 'ground', name: 'G' }] }, ids)).replace('"r1"', '"valueOf"')) as unknown
    const plan = parseFloorPlan(raw)
    expect(plan.walls.map((w) => w.id)).toEqual(ids)
    expect(validatePlan(plan).issues).toEqual([])
    expect(() => checkPlanSanity(plan)).not.toThrow()
    const changes = diffPlans(parseFloorPlan(box('R')), plan).changes.map((c) => c.entity.id)
    for (const id of [...ids, 'valueOf']) expect(changes).toContain(id)
    const objects = text(plan, 'obj').split('\n').filter((line) => line.startsWith('o '))
    for (const id of ids) expect(objects.some((line) => line.includes(id.replace(/[^A-Za-z0-9]/g, '_')))).toBe(true)
  })
})
