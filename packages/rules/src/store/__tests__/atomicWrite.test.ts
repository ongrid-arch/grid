import { chmodSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { atomicWriteFile, atomicWriteJson } from '../atomicWrite'

// CMD-30: the writer follows the umask, keeps a replaced file's mode and leaves a read-only file alone.
const windows = process.platform === 'win32'
let folder: string
let umask: number

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), 'grid-atomic-'))
  umask = process.umask(0o022)
})

afterEach(() => {
  process.umask(umask)
  rmSync(folder, { recursive: true, force: true })
})

const modeOf = (file: string): number => statSync(file).mode & 0o777

describe('the atomic writer', () => {
  it.skipIf(windows)('writes a new file with the mode the umask gives', () => {
    const file = join(folder, 'plan.json')
    atomicWriteFile(file, '{}')
    expect(modeOf(file)).toBe(0o644)
    process.umask(0o077)
    const other = join(folder, 'other.json')
    atomicWriteFile(other, '{}')
    expect(modeOf(other)).toBe(0o600)
  })

  it.skipIf(windows)('keeps the mode of the file it replaces, even one the umask would narrow', () => {
    const file = join(folder, 'plan.json')
    writeFileSync(file, 'old')
    chmodSync(file, 0o664)
    process.umask(0o077)
    atomicWriteFile(file, 'new')
    expect(readFileSync(file, 'utf8')).toBe('new')
    expect(modeOf(file)).toBe(0o664)
  })

  it('refuses a read-only file, leaving it and its mode as they were and nothing beside it', () => {
    const file = join(folder, 'plan.json')
    writeFileSync(file, 'old')
    chmodSync(file, 0o444)
    expect(() => atomicWriteFile(file, 'new')).toThrow(expect.objectContaining({ code: 'EACCES', message: expect.stringContaining('read-only') }))
    expect(readFileSync(file, 'utf8')).toBe('old')
    if (!windows) expect(modeOf(file)).toBe(0o444)
    expect(readdirSync(folder)).toEqual(['plan.json'])
    chmodSync(file, 0o644)
  })

  it.skipIf(windows)('writes the rules store readable by its owner only, whatever the umask and the mode before', () => {
    const file = join(folder, 'locations.json')
    writeFileSync(file, '{}')
    chmodSync(file, 0o644)
    atomicWriteJson(file, { a: 1 })
    expect(modeOf(file)).toBe(0o600)
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ a: 1 })
  })
})
