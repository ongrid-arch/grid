/**
 * The plan diff is part of the geometry core's public surface, and it
 * stays pure. Its sources import only from `geometry/` itself, the shared
 * types and Grid's own words (`messages/`, WRT-19), never React, Three, Node
 * or the DOM, so the same engine can run in Node, in a browser and in a test
 * without a window.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as geometry from '../index'

const GEOMETRY = resolve(__dirname, '..')
const TYPES = resolve(__dirname, '../../types')
const MESSAGES = resolve(__dirname, '../../messages')
const DIFF = resolve(GEOMETRY, 'diff')

/** Globals that only exist in a browser. A pure module never touches them. */
const DOM_GLOBALS = ['window', 'document', 'navigator', 'localStorage', 'HTMLElement', 'requestAnimationFrame']
/** Globals that only exist in Node. A browser has none of them. */
const NODE_GLOBALS = ['process', 'Buffer', '__dirname', '__filename', 'require']

/** Every reason `source`, read from `file`, is not pure. Empty when it is. */
function impurities(file: string, source: string): string[] {
  const found: string[] = []
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  const specifiers = [
    ...code.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g),
    ...code.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g),
    ...code.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm),
    ...code.matchAll(/\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g)
  ].map((m) => m[1]!)

  for (const specifier of specifiers) {
    // The core has no path alias: inside it, every import is relative.
    if (!specifier.startsWith('.')) {
      found.push(`imports ${specifier}`)
      continue
    }
    const target = resolve(dirname(file), specifier)
    const inside = (root: string): boolean => {
      // Across Windows drives `relative` gives an absolute path, which is outside too.
      const path = relative(root, target)
      return !path.startsWith('..') && !isAbsolute(path)
    }
    if (!inside(GEOMETRY) && !inside(TYPES) && !inside(MESSAGES)) found.push(`imports ${specifier} from outside`)
  }

  for (const name of [...DOM_GLOBALS, ...NODE_GLOBALS]) {
    if (new RegExp(`\\b${name}\\s*[.([]`).test(code)) found.push(`uses ${name}`)
  }
  return found
}

function diffSources(): string[] {
  return readdirSync(DIFF)
    .filter((name) => name.endsWith('.ts'))
    .map((name) => resolve(DIFF, name))
}

describe('the plan diff’s public surface', () => {
  it('is exported from the geometry core', () => {
    expect(typeof geometry.diffPlans).toBe('function')
    expect(typeof geometry.statusOf).toBe('function')
    expect(typeof geometry.changesOutsideScope).toBe('function')
    expect(geometry.PLAN_DIFF_SCHEMA_VERSION).toBe(1)
    expect(geometry.LENGTH_TOLERANCE_M).toBe(0.001)
    expect(geometry.AREA_TOLERANCE_M2).toBe(0.01)
    expect(geometry.MIN_MOVEMENT_M).toBe(0.01)
  })
})

describe('the plan diff’s purity', () => {
  const scratch = resolve(DIFF, 'scratch.ts')
  const clean = "import { floorOf } from '../floors'\nimport type { PlanDiff } from './types'\n"

  it('passes a scratch copy that imports only from geometry and the shared types', () => {
    expect(impurities(scratch, clean + "import type { FloorPlan } from '../../types/floorplan'\n")).toEqual([])
  })

  it('reads a relative import as the path it stands for, and takes no package name for one', () => {
    const inside = "import type { FloorPlan } from '../../types/floorplan'\nimport { indexPlan } from '../plan'\n"
    expect(impurities(scratch, clean + inside)).toEqual([])
    expect(impurities(scratch, clean + "import { x } from '../../export/planExport'\n").join()).toContain('from outside')
    expect(impurities(scratch, clean + "import { x } from '@ongrid/floorplan/geometry'\n").join()).toContain('imports @ongrid/floorplan')
  })

  it.each([
    ["import { useMemo } from 'react'", 'imports react'],
    ["import * as THREE from 'three'", 'imports three'],
    ["import { readFileSync } from 'node:fs'", 'imports node:fs'],
    ["import 'fs'", 'imports fs'],
    ["const m = await import('three')", 'imports three'],
    ["const fs = require('fs')", 'imports fs'],
    ["import { Canvas2D } from '../../../../viewer/src/canvas2d/Canvas2D'", 'from outside'],
    ["import { Canvas2D } from '@ongrid/viewer/canvas2d/Canvas2D'", 'imports @ongrid/viewer'],
    ['const width = window.innerWidth', 'uses window'],
    ['if (process.env.DEBUG) console.log(1)', 'uses process'],
    ["const bytes = Buffer.from('x')", 'uses Buffer'],
    ["const svg = document.createElementNS('', 'svg')", 'uses document']
  ])('fails a scratch copy with %s', (line, reason) => {
    const found = impurities(scratch, clean + line + '\n')
    expect(found.join('; ')).toContain(reason)
  })

  it('does not mistake a word in a comment for a DOM global', () => {
    expect(impurities(scratch, clean + '// the window of a wall\n/* document.x */\n')).toEqual([])
    expect(impurities(scratch, clean + "/** the same shape as the canvas, imported from 'react' */\n")).toEqual([])
  })

  it('holds for every source under diff/', () => {
    const files = diffSources()
    expect(files.length).toBeGreaterThan(10)
    for (const file of files) {
      expect({ file: relative(GEOMETRY, file), found: impurities(file, readFileSync(file, 'utf8')) })
        .toEqual({ file: relative(GEOMETRY, file), found: [] })
    }
  })
})
