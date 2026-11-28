/**
 * QAR-5: the same building gives the same export bytes whatever order its parts are listed
 * in, and the IFC's identities come from the project id the plan stores (lab MS-21, L-12,
 * K-13). The lab's 64 plans are replayed in `scoreboard/__tests__/fileOrder.test.ts`.
 */
import { describe, expect, it } from 'vitest'
import type { FloorPlan, Opening, Room, Wall } from '../../types/floorplan'
import { compareIds, inIdOrder, planFloors } from '../../geometry'
import { ifcGuid } from '../../geometry/export/ifc'
import { EXPORT_FORMATS, exportPlan } from '../planExport'

const NOW = new Date('2026-11-21T12:00:00.000Z')
const OPTIONS = { projectId: 'caller-id', projectName: 'House', now: NOW }

const wall = (id: string, start: [number, number], end: [number, number], floor?: string): Wall => ({
  id, start, end, thickness: 0.2, height: 2.7, kind: 'interior', ...(floor === undefined ? {} : { floor }),
})

/**
 * Two floors of three rooms in a row, every inside wall shared, with doors and windows. Ids
 * run past 9 so that the order "w2 before w10" is tested, and the upper floor reuses the
 * lower floor's ids for its rooms and openings.
 */
function building(): FloorPlan {
  const walls: Wall[] = []
  const rooms: Room[] = []
  const openings: Opening[] = []
  for (const floor of ['ground', 'first']) {
    const f = floor === 'ground' ? '' : 'u'
    const on = floor === 'ground' ? undefined : floor
    walls.push(
      wall(`${f}w1`, [0, 0], [4, 0], on), wall(`${f}w2`, [4, 0], [8, 0], on), wall(`${f}w3`, [8, 0], [12, 0], on),
      wall(`${f}w4`, [12, 0], [12, 4], on), wall(`${f}w5`, [12, 4], [8, 4], on), wall(`${f}w6`, [8, 4], [4, 4], on),
      wall(`${f}w7`, [4, 4], [0, 4], on), wall(`${f}w8`, [0, 4], [0, 0], on), wall(`${f}w9`, [4, 0], [4, 4], on),
      wall(`${f}w10`, [8, 0], [8, 4], on),
    )
    for (const w of walls.slice(-10, -2)) w.kind = 'exterior'
    rooms.push(
      { id: `${f}r1`, name: 'West', boundary: [`${f}w1`, `${f}w9`, `${f}w7`, `${f}w8`], ...(on ? { floor: on } : {}) },
      { id: `${f}r2`, name: 'Middle', boundary: [`${f}w2`, `${f}w10`, `${f}w6`, `${f}w9`], ...(on ? { floor: on } : {}) },
      { id: `${f}r10`, name: 'East', boundary: [`${f}w3`, `${f}w4`, `${f}w5`, `${f}w10`], ...(on ? { floor: on } : {}) },
    )
    openings.push(
      { id: `${f}d1`, wall: `${f}w9`, type: 'door', offset: 1, width: 0.9, sill: 0, height: 2.1 },
      { id: `${f}d2`, wall: `${f}w10`, type: 'door', offset: 2, width: 0.9, sill: 0, height: 2.1 },
      { id: `${f}win1`, wall: `${f}w1`, type: 'window', offset: 1, width: 1.2, sill: 0.9, height: 1.2 },
      { id: `${f}win2`, wall: `${f}w3`, type: 'window', offset: 1.5, width: 1, sill: 0.9, height: 1.2 },
      { id: `${f}win10`, wall: `${f}w5`, type: 'window', offset: 1, width: 1, sill: 0.9, height: 1.2 },
    )
  }
  return { version: '1', units: 'm', floors: [{ id: 'ground', name: 'Ground', level: 0 }, { id: 'first', name: 'First', level: 1 }], walls, rooms, openings }
}

/** A seeded shuffle (mulberry32), so a failure can be replayed. */
function shuffled<T>(list: readonly T[], seed: number): T[] {
  let a = seed >>> 0
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), a | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1))
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

/** Every export of the plan: IFC once, the other three for each floor. */
function exportsOf(plan: FloorPlan): Record<string, string> {
  const out: Record<string, string> = {}
  for (const format of EXPORT_FORMATS) {
    const floors = format === 'ifc' ? [null] : planFloors(plan).map((floor) => floor.id)
    for (const floorId of floors) {
      const { data } = exportPlan(plan, format, { ...OPTIONS, floorId })
      out[`${format}:${floorId}`] = typeof data === 'string' ? data : Buffer.from(data).toString('base64')
    }
  }
  return out
}

const guidsOf = (ifc: string): string[] => [...ifc.matchAll(/^#\d+=IFC\w+\('([0-9A-Za-z_$]{22})'/gm)].map((m) => m[1]!)

describe('exports whatever the order of the file (QAR-5)', () => {
  const base = exportsOf(building())

  it.each([1, 2, 3, 4, 5, 6, 7, 8])('gives the same bytes in every format with walls, rooms and openings shuffled (seed %i)', (seed) => {
    const plan = building()
    const moved: FloorPlan = {
      ...plan,
      walls: shuffled(plan.walls, seed),
      rooms: shuffled(plan.rooms, seed + 100),
      openings: shuffled(plan.openings, seed + 200),
    }
    expect(exportsOf(moved)).toEqual(base)
  })

  it('gives the same bytes when one id is used twice, whichever copy comes first', () => {
    const plan = building()
    const copy: Wall = { ...plan.walls[0]!, start: [20, 20], end: [25, 20] }
    const one = { ...plan, walls: [...plan.walls, copy] }
    const other = { ...plan, walls: [copy, ...plan.walls] }
    expect(exportsOf(other)).toEqual(exportsOf(one))
  })

  it('writes the parts in id order, numbers by their value: w2 before w10', () => {
    const obj = exportsOf({ ...building(), walls: shuffled(building().walls, 9) })['obj:ground']!
    const objects = obj.split('\n').filter((line) => line.startsWith('o ')).map((line) => line.slice(2))
    expect(objects).toEqual([
      'wall_w1', 'wall_w2', 'wall_w3', 'wall_w4', 'wall_w5', 'wall_w6', 'wall_w7', 'wall_w8', 'wall_w9', 'wall_w10',
      'floor_r1', 'floor_r2', 'floor_r10',
      // CMD-55: each room's ceiling.
      'ceiling_r1', 'ceiling_r2', 'ceiling_r10',
      // CNT-14: each door's and window's parts, in id order too.
      'frame_d1', 'leaf_d1', 'frame_d2', 'leaf_d2', 'frame_win1', 'glass_win1', 'frame_win2', 'glass_win2', 'frame_win10', 'glass_win10',
      // LVL-4: the floor's slab, after the parts of the plan; the floor above covers all of it, so no roof.
      'slab_ground',
    ])
  })
})

describe('the order of ids', () => {
  it('reads numbers inside an id by their value, and the rest by character', () => {
    const ids = ['w10', 'w2', 'w1', 'a', 'w01', 'W1', 'w', 'w1a', 'w1-2', 'wall', '10', '9']
    expect([...ids].sort(compareIds)).toEqual(['9', '10', 'W1', 'a', 'w', 'w01', 'w1', 'w1-2', 'w1a', 'w2', 'w10', 'wall'])
  })

  it('is a total order: no two different ids compare equal', () => {
    expect(compareIds('w01', 'w1')).not.toBe(0)
    expect(Math.sign(compareIds('w01', 'w1'))).toBe(-Math.sign(compareIds('w1', 'w01')))
    expect(compareIds('w1', 'w1')).toBe(0)
  })

  it('leaves the plan it is given as it was', () => {
    const plan = { ...building(), walls: shuffled(building().walls, 3) }
    const before = JSON.stringify(plan)
    inIdOrder(plan)
    expect(JSON.stringify(plan)).toBe(before)
  })

  it('keeps the floors list and each room outline as written', () => {
    const plan = building()
    const reordered = { ...plan, floors: [...plan.floors!].reverse(), rooms: plan.rooms.map((r) => ({ ...r, boundary: [...r.boundary].reverse() })) }
    const sorted = inIdOrder(reordered)
    expect(sorted.floors).toEqual(reordered.floors)
    for (const room of sorted.rooms) expect(room.boundary).toEqual(reordered.rooms.find((r) => r.id === room.id)!.boundary)
  })
})

describe('IFC identities from the stored project id (QAR-5)', () => {
  const ifc = (plan: FloorPlan, projectName: string, projectId = 'caller-id'): string =>
    exportPlan(plan, 'ifc', { projectId, projectName, now: NOW }).data as string

  it('does not change with the name the export is given, once the plan stores its id', () => {
    const plan = { ...building(), projectId: 'stored-id' }
    expect(guidsOf(ifc(plan, 'house'))).toEqual(guidsOf(ifc(plan, 'House')))
    expect(guidsOf(ifc(plan, 'house', 'house'))).toEqual(guidsOf(ifc(plan, 'House', 'House')))
  })

  it('takes the stored id over the one the caller passes', () => {
    const plan = { ...building(), projectId: 'stored-id' }
    expect(guidsOf(ifc(plan, 'house', 'one'))).toEqual(guidsOf(ifc(plan, 'house', 'another')))
    expect(guidsOf(ifc(plan, 'house'))).not.toEqual(guidsOf(ifc({ ...plan, projectId: 'other-stored-id' }, 'house')))
  })

  it("builds each element's identity from the project id, its kind, its floor and its id", () => {
    const plan = { ...building(), projectId: 'stored-id' }
    const text = ifc(plan, 'house')
    const wallGuid = (floor: string, id: string): string => ifcGuid(JSON.stringify(['stored-id', 'wall', floor, id]))
    expect(text).toContain(`IFCWALLSTANDARDCASE('${wallGuid('ground', 'w1')}'`)
    expect(text).toContain(`IFCWALLSTANDARDCASE('${wallGuid('first', 'uw1')}'`)
    expect(text).toContain(`IFCSPACE('${ifcGuid(JSON.stringify(['stored-id', 'space', 'first', 'ur1']))}'`)
  })

  it('gives the same id on two floors two identities that do not hang on which floor is written first', () => {
    const twice = (): FloorPlan => {
      const plan = building()
      // The upper floor's walls and rooms take the ground floor's ids.
      const rename = (id: string): string => id.replace(/^u/, '')
      return {
        ...plan,
        projectId: 'stored-id',
        walls: plan.walls.map((w) => ({ ...w, id: rename(w.id) })),
        rooms: plan.rooms.map((r) => ({ ...r, id: rename(r.id), boundary: r.boundary.map(rename) })),
        openings: plan.openings.filter((o) => !o.id.startsWith('u')),
      }
    }
    const text = ifc(twice(), 'house')
    const ground = ifcGuid(JSON.stringify(['stored-id', 'wall', 'ground', 'w1']))
    const first = ifcGuid(JSON.stringify(['stored-id', 'wall', 'first', 'w1']))
    expect(ground).not.toBe(first)
    expect(text).toContain(`IFCWALLSTANDARDCASE('${ground}'`)
    expect(text).toContain(`IFCWALLSTANDARDCASE('${first}'`)
  })
})
