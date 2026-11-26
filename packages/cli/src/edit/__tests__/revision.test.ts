import { spawn } from 'child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openProject, type Project } from '../../fs/projectFiles'
import { heldText, holdsPlanLock, lockFileOf, planRevisionOf, PlanBusy, readRevision, REVISION_DIGITS, withPlanLock, withPlanLockAsync } from '../revision'

let folder: string
let project: Project

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), 'grid-revision-'))
  project = openProject(folder, folder, 'project')
  writeFileSync(join(folder, 'plan.json'), '{"version":"1","walls":[]}\n')
})

afterEach(() => rmSync(folder, { recursive: true, force: true }))

const lockPath = (): string => join(folder, 'plan.lock')

/** A process that is not running: a child that has ended. */
async function goneProcessId(): Promise<number> {
  const child = spawn(process.execPath, ['-e', ''])
  await new Promise((resolve) => child.on('close', resolve))
  return child.pid!
}

describe('the plan revision', () => {
  it('is a fingerprint of the file: the same text keeps it, any change gives a new one', () => {
    const first = planRevisionOf(project, 'plan.json')
    expect(first).toMatch(new RegExp(`^[0-9a-f]{${REVISION_DIGITS}}$`))
    expect(planRevisionOf(project, 'plan.json')).toBe(first)
    writeFileSync(join(folder, 'plan.json'), '{"version":"1","walls":[] }\n')
    expect(planRevisionOf(project, 'plan.json')).not.toBe(first)
    writeFileSync(join(folder, 'plan.json'), '{"version":"1","walls":[]}\n')
    expect(planRevisionOf(project, 'plan.json')).toBe(first)
  })

  it('is null for a plan that is not there', () => {
    expect(planRevisionOf(project, 'other.json')).toBeNull()
  })

  it('holds the text read at each revision, so what changed since can be said', () => {
    const read = readRevision(project, 'plan.json')!
    writeFileSync(join(folder, 'plan.json'), '{"version":"1","walls":[],"rooms":[]}\n')
    readRevision(project, 'plan.json')
    expect(heldText(read.real, read.revision)).toBe('{"version":"1","walls":[]}\n')
    expect(heldText(read.real, '000000000000')).toBeNull()
  })
})

describe('the plan lock', () => {
  it('is a file beside the plan, made for the change and removed after', () => {
    expect(lockFileOf('options/plan-b.json')).toBe(join('options', 'plan-b.lock'))
    const seen = withPlanLock(project, 'plan.json', () => {
      expect(holdsPlanLock(project, 'plan.json')).toBe(true)
      return JSON.parse(readFileSync(lockPath(), 'utf8')) as { pid: number }
    })
    expect(seen.pid).toBe(process.pid)
    expect(existsSync(lockPath())).toBe(false)
    expect(holdsPlanLock(project, 'plan.json')).toBe(false)
  })

  it('is removed when the change throws', () => {
    expect(() => withPlanLock(project, 'plan.json', () => { throw new Error('refused') })).toThrow('refused')
    expect(existsSync(lockPath())).toBe(false)
  })

  it('is re-entrant within one process: the server\'s hold and the edit path\'s are one', async () => {
    await withPlanLockAsync(project, 'plan.json', async () => {
      withPlanLock(project, 'plan.json', () => expect(existsSync(lockPath())).toBe(true))
      // The inner hold leaves the outer one's file in place.
      expect(existsSync(lockPath())).toBe(true)
    })
    expect(existsSync(lockPath())).toBe(false)
  })

  it('waits for another process that holds it, then takes it', () => {
    // Another live process holds the lock and lets it go after a moment.
    writeFileSync(lockPath(), `${JSON.stringify({ pid: process.ppid, at: new Date().toISOString() })}\n`)
    const child = spawn(process.execPath, ['-e', `setTimeout(() => require('fs').unlinkSync(${JSON.stringify(lockPath())}), 300)`], { stdio: 'ignore' })
    const started = Date.now()
    const ran = withPlanLock(project, 'plan.json', () => Date.now())
    expect(ran - started).toBeGreaterThanOrEqual(150)
    expect(existsSync(lockPath())).toBe(false)
    child.kill()
  })

  it('waits without blocking in the server, and gives up with PlanBusy when it is held too long', async () => {
    writeFileSync(lockPath(), `${JSON.stringify({ pid: process.ppid, at: new Date().toISOString() })}\n`)
    await expect(withPlanLockAsync(project, 'plan.json', async () => 'ran', 200)).rejects.toBeInstanceOf(PlanBusy)
    // The other process's lock is left as it was.
    expect(existsSync(lockPath())).toBe(true)
    setTimeout(() => rmSync(lockPath()), 100)
    await expect(withPlanLockAsync(project, 'plan.json', async () => 'ran', 5_000)).resolves.toBe('ran')
  })

  it('takes over a lock whose process is gone, or one too old to be held', async () => {
    writeFileSync(lockPath(), `${JSON.stringify({ pid: await goneProcessId(), at: new Date().toISOString() })}\n`)
    expect(withPlanLock(project, 'plan.json', () => 'ran')).toBe('ran')
    writeFileSync(lockPath(), `${JSON.stringify({ pid: process.ppid, at: '2020-01-01T00:00:00.000Z' })}\n`)
    expect(withPlanLock(project, 'plan.json', () => 'ran')).toBe('ran')
    writeFileSync(lockPath(), 'not a lock')
    expect(withPlanLock(project, 'plan.json', () => 'ran')).toBe('ran')
    expect(existsSync(lockPath())).toBe(false)
  })

  it('lets a change go on without it where no lock file can be made', () => {
    expect(withPlanLock(project, 'missing/plan.json', () => 'ran')).toBe('ran')
  })
})
