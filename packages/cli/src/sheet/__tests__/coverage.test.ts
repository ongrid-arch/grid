import { describe, expect, it } from 'vitest'
import { FACT_FIELDS, PHASE_FIELDS, FloorPlanFieldsSchema, FloorSchema, ItemSchema, OpeningFieldsSchema, RoomSchema, WallSchema } from '@ongrid/floorplan/types/floorplan'
import { FACT_COVERAGE, OUTLINE_COVERAGE, PHASE_COVERAGE, SHEET_COVERAGE } from '../coverage'

describe('the sheet covers every part of a plan (VEW-7)', () => {
  it('has one entry for each top-level part of the schema, and no other', () => {
    expect(Object.keys(SHEET_COVERAGE).sort()).toEqual(Object.keys(FloorPlanFieldsSchema.shape).sort())
  })
  it('says why a part is not shown', () => {
    for (const [part, coverage] of Object.entries(SHEET_COVERAGE)) {
      if (coverage.shown === 'not shown') expect(coverage.why.length, part).toBeGreaterThan(10)
    }
  })
  it('says what it does with each field CNT-9 adds to the parts, and each is in the schema', () => {
    expect(Object.keys(FACT_COVERAGE).sort()).toEqual([...FACT_FIELDS].sort())
    const shapes: Record<string, Record<string, unknown>> = {
      walls: (WallSchema as unknown as { _def: { schema: { _def: { schema: { shape: Record<string, unknown> } } } } })._def.schema._def.schema.shape,
      // CNT-15: an opening's fields are under the reading that records what its type filled in.
      openings: OpeningFieldsSchema.shape,
      rooms: RoomSchema.shape,
      floors: FloorSchema.shape,
      // CNT-52: an item's fields are under the reading that fills it from its library entry.
      items: (ItemSchema as unknown as { _def: { schema: { shape: Record<string, unknown> } } })._def.schema.shape,
    }
    for (const field of FACT_FIELDS) {
      const [list, key] = field.split('.') as [string, string]
      expect(Object.hasOwn(shapes[list]!, key), field).toBe(true)
    }
    for (const [part, coverage] of Object.entries(FACT_COVERAGE)) {
      if (coverage.shown === 'not shown') expect(coverage.why.length, part).toBeGreaterThan(10)
    }
  })
  it('says what it does with each field that carries a phase (CNT-10), and each is in the schema', () => {
    expect(Object.keys(PHASE_COVERAGE).sort()).toEqual([...PHASE_FIELDS].sort())
    const shapes: Record<string, Record<string, unknown>> = {
      walls: (WallSchema as unknown as { _def: { schema: { _def: { schema: { shape: Record<string, unknown> } } } } })._def.schema._def.schema.shape,
      // CNT-15: an opening's fields are under the reading that records what its type filled in.
      openings: OpeningFieldsSchema.shape,
      rooms: RoomSchema.shape,
    }
    for (const field of PHASE_FIELDS) {
      const [list, key] = field.split('.') as [string, string]
      expect(Object.hasOwn(shapes[list]!, key), field).toBe(true)
    }
  })
  it('says what it does with the floor outline and the counts BRF-4 adds, and each is a floor field', () => {
    for (const [field, coverage] of Object.entries(OUTLINE_COVERAGE)) {
      const [list, key] = field.split('.') as [string, string]
      expect(list).toBe('floors')
      expect(Object.hasOwn(FloorSchema.shape, key), field).toBe(true)
      if (coverage.shown === 'not shown') expect(coverage.why.length, field).toBeGreaterThan(10)
    }
  })
})
