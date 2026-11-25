import { chmodSync, linkSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'fs'
import { homedir, tmpdir } from 'os'
import { join, parse, resolve } from 'path'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { NAME_MAX_BYTES, openProject, pathProblem, PathRefused, startProjectFolder, type Project } from '../projectFiles'
import { LINK_CASES_SKIPPED_ON_WINDOWS, T5_TRACE_IMAGE_PATHS, T4_WINDOWS_NAMES } from './attackCases'

const windows = process.platform === 'win32'
const made: string[] = []
let root: string
let real: string
let project: Project

function tempDir(prefix: string): string {
  const path = mkdtempSync(join(tmpdir(), prefix))
  made.push(path)
  return path
}

/**
 * A link to a folder. On Windows a junction, which needs no special rights, so the folder
 * cases run there too; only links to files need rights Windows CI may not have.
 */
function linkFolder(target: string, path: string): void {
  symlinkSync(target, path, windows ? 'junction' : 'dir')
}

beforeEach(() => {
  root = tempDir('grid-project-')
  real = realpathSync.native(root)
  project = openProject(root, root)
})

afterAll(() => {
  for (const path of made) rmSync(path, { recursive: true, force: true })
})

/** Refused with a PathRefused whose one-line message names the path and the project folder. */
function expectRefused(act: () => unknown, given: string, ...words: string[]): void {
  let caught: unknown
  try {
    act()
  } catch (error) {
    caught = error
  }
  expect(caught).toBeInstanceOf(PathRefused)
  const message = (caught as Error).message
  expect(message.split('\n')).toHaveLength(1)
  expect(message).toContain(JSON.stringify(given))
  expect(message).toContain(JSON.stringify(real))
  for (const word of words) expect(message).toContain(word)
}

describe('the six T-5 trace-image paths', () => {
  it.each(T5_TRACE_IMAGE_PATHS)('%j is refused for reading, writing and checking, naming the path and the folder', (given, why) => {
    writeFileSync(join(root, 'plan.json'), '{}')
    expectRefused(() => project.readText(given), given, why)
    expectRefused(() => project.writeFile(given, 'x'), given, why)
    expectRefused(() => project.resolve(given), given, why)
    expect(readdirSync(root)).toEqual(['plan.json'])
  })
})

describe('a path written inside a plan (CMD-15)', () => {
  it('starts from the project folder when asked, wherever Grid runs', () => {
    mkdirSync(join(root, 'plans'))
    mkdirSync(join(root, 'assets'))
    const fromPlans = openProject(root, join(root, 'plans'))
    expect(fromPlans.resolve('assets/reference.png', 'project')).toBe(join(real, 'assets', 'reference.png'))
    expect(fromPlans.resolve('assets/reference.png')).toBe(join(real, 'plans', 'assets', 'reference.png'))
    expect(fromPlans.resolve('../assets/reference.png', 'cwd')).toBe(join(real, 'assets', 'reference.png'))
    expectRefused(() => fromPlans.resolve('../assets/reference.png', 'project'), '../assets/reference.png', 'outside the project folder')
  })

  it.each(T5_TRACE_IMAGE_PATHS)('%j is refused from the project folder too', (given, why) => {
    expectRefused(() => project.resolve(given, 'project'), given, why)
  })
})

describe('Windows names (T-4), refused on every system', () => {
  it.each(T4_WINDOWS_NAMES)('%j', (given, why) => {
    expect(pathProblem(given, 'linux')).toContain(why)
    expect(pathProblem(given, 'win32')).toContain(why)
    expectRefused(() => project.writeFile(given, 'x'), given, why)
    expect(readdirSync(root)).toEqual([])
  })

  it('keeps names that only look close', () => {
    for (const name of ['console.dxf', 'nullable.svg', 'com10.dxf', 'lpt.svg', 'con-flat.json', 'aux_room.json', 'plan.v2.json']) {
      expect(pathProblem(name)).toBeNull()
    }
  })
})

describe('what the text alone refuses', () => {
  it.each([
    ['data:text/plain,hello', 'an address (data:)'],
    ['ftp://example.invalid/plan.json', 'an address (ftp:)'],
    ['blob:https://example.invalid/1', 'an address (blob:)'],
    ['//server/share/plan.json', 'a network path'],
    ['\\\\.\\PhysicalDrive0', 'a Windows device path'],
    ['\\??\\C:\\plan.json', 'a Windows device path'],
    ['plan.json:hidden', 'hidden data stream'],
    ['plans\\plan.json:Zone.Identifier', 'hidden data stream'],
    ['pl?n.json', 'does not allow'],
    ['a|b.svg', 'does not allow'],
    ['line\nbreak.json', 'a control character'],
    ['nul\u0000.dxf', 'a control character'],
    ['fdp.\u202egnp', 'an invisible direction'],
    ['', 'it is empty'],
    [`${'n'.repeat(NAME_MAX_BYTES + 1)}.dxf`, `longer than ${NAME_MAX_BYTES} bytes`],
    ['x'.repeat(5000), 'longer than 4096 characters'],
  ])('%j', (given, why) => {
    expect(pathProblem(given)).toContain(why)
  })

  it('reads a drive letter as a Windows path, refused where there are no drives', () => {
    expect(pathProblem('C:\\Windows\\win.ini', 'linux')).toContain('a Windows path')
    expect(pathProblem('C:\\Windows\\win.ini', 'win32')).toBeNull()
    expect(pathProblem('C:plan.json', 'win32')).toContain('current folder of drive C:')
  })
})

describe('symbolic links that lead outside', () => {
  let outside: string

  beforeEach(() => {
    outside = tempDir('grid-outside-')
    writeFileSync(join(outside, 'victim.json'), '{"secret": true}')
    writeFileSync(join(outside, 'victim.svg'), 'victim')
  })

  it('refuses a folder link, for reading and writing, and writes nothing outside', () => {
    linkFolder(outside, join(root, 'linked'))
    for (const given of ['linked/victim.json', 'linked/new.svg', join(root, 'linked', 'victim.svg')]) {
      expectRefused(() => project.readText(given), given, 'outside the project folder', 'through a symbolic link')
      expectRefused(() => project.writeFile(given, 'x'), given, 'outside the project folder', 'through a symbolic link')
    }
    expect(readFileSync(join(outside, 'victim.svg'), 'utf8')).toBe('victim')
    expect(readdirSync(outside).sort()).toEqual(['victim.json', 'victim.svg'])
  })

  it('refuses a missing file below a folder link, without saying whether it exists outside', () => {
    linkFolder(outside, join(root, 'linked'))
    expectRefused(() => project.readText('linked/missing.json'), 'linked/missing.json', 'outside the project folder')
  })

  it('reads `..` by the text, so `linked/..` is the project folder, never the parent of the link\'s target', () => {
    linkFolder(outside, join(root, 'linked'))
    expect(project.resolve('linked/../plan.json')).toBe(join(real, 'plan.json'))
    expectRefused(() => project.resolve('linked/../../plan.json'), 'linked/../../plan.json', 'outside the project folder')
  })

  // Windows: a link to a file needs Developer Mode or administrator rights, which CI runners
  // may not have. The folder cases above use junctions and run on Windows too.
  it.skipIf(windows)(`refuses a file link that leads outside, and replaces nothing through it (${LINK_CASES_SKIPPED_ON_WINDOWS})`, () => {
    symlinkSync(join(outside, 'victim.json'), join(root, 'plan.json'))
    symlinkSync(join(outside, 'victim.svg'), join(root, 'plan.svg'))
    expectRefused(() => project.readText('plan.json'), 'plan.json', 'through a symbolic link')
    expectRefused(() => project.writeFile('plan.svg', 'x'), 'plan.svg', 'through a symbolic link')
    expect(readFileSync(join(outside, 'victim.svg'), 'utf8')).toBe('victim')
  })

  it.skipIf(windows)('follows a file link that stays inside, and writes its target', () => {
    writeFileSync(join(root, 'real.svg'), 'old')
    symlinkSync(join(root, 'real.svg'), join(root, 'alias.svg'))
    expect(project.writeFile('alias.svg', 'new')).toBe(join(real, 'real.svg'))
    expect(readFileSync(join(root, 'real.svg'), 'utf8')).toBe('new')
  })

  it.skipIf(windows)('refuses a link to nothing outside, and creates nothing there', () => {
    symlinkSync(join(outside, 'gone.svg'), join(root, 'dangling.svg'))
    expectRefused(() => project.writeFile('dangling.svg', 'x'), 'dangling.svg', 'through a symbolic link')
    expect(readdirSync(outside).sort()).toEqual(['victim.json', 'victim.svg'])
  })

  it('refuses a path outside by its text before looking at the disk, so a refusal tells nothing of what is there', () => {
    const missing = join(outside, 'nothing-here', 'x.json')
    const there = join(outside, 'victim.json')
    expectRefused(() => project.readText(missing), missing, 'outside the project folder')
    expectRefused(() => project.readText(there), there, 'outside the project folder')
  })

  it.skipIf(windows)('refuses a link whose target is a network path, without following it', () => {
    symlinkSync('//attacker/share', join(root, 'share'))
    expectRefused(() => project.readText('share/plan.json'), 'share/plan.json', 'through a symbolic link')
  })

  it('appends to no file with other names: a hard link may be a file outside', () => {
    linkSync(join(outside, 'victim.svg'), join(root, 'notes.txt'))
    expect(project.isLinked('notes.txt')).toBe(true)
    expectRefused(() => project.appendText('notes.txt', 'x'), 'notes.txt', 'a hard link')
    expect(readFileSync(join(outside, 'victim.svg'), 'utf8')).toBe('victim')
  })
})

describe('paths inside the project', () => {
  it('reads and writes by relative and absolute paths, `..` that stays inside, and either separator', () => {
    mkdirSync(join(root, 'plans'))
    writeFileSync(join(root, 'plans', 'flat.json'), 'flat')
    expect(project.readText('plans/flat.json').text).toBe('flat')
    expect(project.readText('plans\\flat.json').text).toBe('flat')
    expect(project.readText('plans/../plans/./flat.json').text).toBe('flat')
    expect(project.readText(join(root, 'plans', 'flat.json')).text).toBe('flat')
    expect(project.writeFile('plans/flat.svg', 'svg')).toBe(join(real, 'plans', 'flat.svg'))
    expect(project.readText('plans/flat.svg').text).toBe('svg')
  })

  it('refuses `..` that leaves the project', () => {
    mkdirSync(join(root, 'plans'))
    expectRefused(() => project.readText('plans/../../plan.json'), 'plans/../../plan.json', 'outside the project folder')
    expectRefused(() => project.writeFile('..\\escaped.dxf', 'x'), '..\\escaped.dxf', 'outside the project folder')
  })

  it('makes the missing folders on the way, inside the project (CMD-19)', () => {
    expect(project.writeFile('a/b/plan.svg', 'x')).toBe(join(real, 'a', 'b', 'plan.svg'))
    expect(project.readText('a/b/plan.svg').text).toBe('x')
  })

  it('refuses a file on the way with ENOTDIR, in one line, and makes nothing', () => {
    writeFileSync(join(root, 'flat'), 'x')
    expect(() => project.writeFile('flat/plan.svg', 'x')).toThrow(expect.objectContaining({ code: 'ENOTDIR' }))
    expect(() => project.writable('flat/deeper/plan.svg')).toThrow(expect.objectContaining({ code: 'ENOTDIR' }))
    expect(readdirSync(root)).toEqual(['flat'])
  })

  it('writable checks without making a folder', () => {
    expect(project.writable('missing/plan.svg')).toBe(join(real, 'missing', 'plan.svg'))
    expect(readdirSync(root)).toEqual([])
  })

  it('writes a name of 255 bytes: the temporary file has a short name of its own', () => {
    const name = `${'n'.repeat(NAME_MAX_BYTES - 4)}.dxf`
    project.writeFile(name, 'x')
    expect(readdirSync(root)).toEqual([name])
  })

  // CMD-30: a teammate in the same group, or a web server, can read what Grid writes.
  it.skipIf(windows)('writes files with the mode the umask gives, and keeps a replaced file\'s', () => {
    const umask = process.umask(0o022)
    try {
      project.writeFile('plan.svg', 'x')
      expect(statSync(join(root, 'plan.svg')).mode & 0o777).toBe(0o644)
      project.createFile('new.txt', 'x')
      expect(statSync(join(root, 'new.txt')).mode & 0o777).toBe(0o644)
      chmodSync(join(root, 'plan.svg'), 0o640)
      project.writeFile('plan.svg', 'y')
      expect(statSync(join(root, 'plan.svg')).mode & 0o777).toBe(0o640)
    } finally {
      process.umask(umask)
    }
  })

  it('refuses a read-only file before writing, and leaves it as it was', () => {
    writeFileSync(join(root, 'plan.json'), 'old')
    chmodSync(join(root, 'plan.json'), 0o444)
    expect(() => project.writable('plan.json')).toThrow(expect.objectContaining({ code: 'EACCES', message: expect.stringContaining('read-only') }))
    expect(() => project.writeFile('plan.json', 'new')).toThrow(expect.objectContaining({ code: 'EACCES' }))
    expect(readFileSync(join(root, 'plan.json'), 'utf8')).toBe('old')
    chmodSync(join(root, 'plan.json'), 0o644)
  })

  it('reads only plain files', () => {
    mkdirSync(join(root, 'folder.json'))
    expect(() => project.readText('folder.json')).toThrow(expect.objectContaining({ code: 'EISDIR' }))
    expect(() => project.readText('missing.json')).toThrow(expect.objectContaining({ code: 'ENOENT' }))
  })
})

describe('the project folder', () => {
  it('is the folder Grid runs in, or the one --project names, as its real path', () => {
    mkdirSync(join(root, 'site'))
    expect(openProject(undefined, root).folder).toBe(real)
    expect(openProject('site', root).folder).toBe(join(real, 'site'))
    expect(openProject(join(root, 'site'), tmpdir()).folder).toBe(join(real, 'site'))
  })

  it('starts relative paths from the folder Grid runs in, or for the tool server from the project folder', () => {
    mkdirSync(join(root, 'site'))
    writeFileSync(join(root, 'site', 'flat.json'), 'flat')
    expect(openProject('site', root).readText('site/flat.json').text).toBe('flat')
    expect(openProject('site', root, 'project').readText('flat.json').text).toBe('flat')
    expect(() => openProject('site', root, 'project').readText('site/flat.json')).toThrow(expect.objectContaining({ code: 'ENOENT' }))
  })

  it('may have a name the path rules would refuse below it, as a folder this computer allows', () => {
    // A pipe or a trailing dot is a legal folder name on macOS and Linux; Windows can't make one.
    const odd = join(root, windows ? 'Smith & House' : 'Smith | House.')
    mkdirSync(odd)
    const inOdd = openProject(odd, root)
    writeFileSync(join(odd, 'flat.json'), 'flat')
    expect(inOdd.readText(join(odd, 'flat.json')).text).toBe('flat')
    expect(inOdd.writeFile(join(odd, 'flat.svg'), 'svg')).toBe(join(realpathSync.native(odd), 'flat.svg'))
    expect(() => inOdd.writeFile(join(odd, 'CON.svg'), 'x')).toThrow(/a name Windows keeps for a device/)
  })

  it('is never a network or device path, refused before the disk is touched', () => {
    expect(() => openProject('\\\\attacker\\share', root)).toThrow(/a network path/)
    expect(() => openProject('//attacker/share', root)).toThrow(/a network path/)
    expect(() => openProject('\\\\?\\C:\\', root)).toThrow(/a Windows device path/)
  })

  it('is never the top of a disk', () => {
    const top = parse(resolve(root)).root
    expect(() => openProject(top, root)).toThrow(/top of a disk/)
    expect(() => openProject(undefined, top)).toThrow(/Grid runs in .* top of a disk/)
  })

  it('is never the home folder, though a folder inside it is fine', () => {
    expect(() => openProject(homedir(), root)).toThrow(/home folder/)
    expect(() => openProject(undefined, homedir())).toThrow(/home folder/)
  })

  it('must be a folder that exists, named by a plain path', () => {
    writeFileSync(join(root, 'plan.json'), '{}')
    expect(() => openProject('nowhere', root)).toThrow(/no such folder/)
    expect(() => openProject('plan.json', root)).toThrow(/a file, not a folder/)
    expect(() => openProject('https://example.invalid/', root)).toThrow(/an address \(https:\)/)
    expect(() => openProject('\\\\server\\share', root)).toThrow(/a network path/)
  })
})

describe('making new files and the project folder (CMD-6)', () => {
  it('createFile writes a new file and never replaces one', () => {
    const file = join(root, 'plan.json')
    expect(project.createFile(file, 'new')).toBe(join(real, 'plan.json'))
    expect(readFileSync(file, 'utf8')).toBe('new')
    expect(() => project.createFile(file, 'again')).toThrow(expect.objectContaining({ code: 'EEXIST' }))
    expect(readFileSync(file, 'utf8')).toBe('new')
    expect(readdirSync(root)).toEqual(['plan.json'])
  })

  it('createFile refuses a path outside the project, through a link too', () => {
    const outside = tempDir('grid-outside-')
    linkFolder(outside, join(root, 'out'))
    expectRefused(() => project.createFile(join(root, 'out', 'plan.json'), 'x'), join(root, 'out', 'plan.json'), 'symbolic link')
    expectRefused(() => project.createFile('../plan.json', 'x'), '../plan.json')
    expect(readdirSync(outside)).toEqual([])
  })

  it('exists tells a missing name from a file and a folder', () => {
    mkdirSync(join(root, 'exports'))
    writeFileSync(join(root, 'plan.json'), '{}')
    expect(project.exists(join(root, 'exports'))).toBe(true)
    expect(project.exists(join(root, 'plan.json'))).toBe(true)
    expect(project.exists(join(root, 'grid.json'))).toBe(false)
  })

  it('startProjectFolder makes the last folder only, and opens one that is there', () => {
    const started = startProjectFolder('demo', root)
    expect(started.made).toBe(true)
    expect(started.project.folder).toBe(join(real, 'demo'))
    expect(startProjectFolder('demo', root).made).toBe(false)
    expect(startProjectFolder(undefined, join(root, 'demo')).project.folder).toBe(join(real, 'demo'))
    expect(() => startProjectFolder(join('missing', 'demo'), root)).toThrow(PathRefused)
    expect(() => startProjectFolder('CON', root)).toThrow(PathRefused)
    expect(readdirSync(root)).toEqual(['demo'])
  })
})
