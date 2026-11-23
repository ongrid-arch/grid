import { readdirSync, readFileSync } from 'fs'
import { join, relative, resolve, sep } from 'path'
import { build } from 'esbuild'
import { describe, expect, it } from 'vitest'

/**
 * CMD-15: nothing in packages/cli reads or writes a file around the project's resolver,
 * `src/fs/projectFiles.ts`. Two checks: a scan of the source text, and the import graph of
 * what the command and the tool server really run, other packages included.
 */

const cli = resolve(__dirname, '../..')
const RESOLVER = 'src/fs/projectFiles.ts'
/**
 * Grid's one atomic writer (QAR-6), in the rules package beside the rules store. The resolver
 * hands it only paths it has resolved inside the project.
 */
const WRITER = '../rules/src/store/atomicWrite.ts'

/** Files that may touch the disk without the resolver, and why. Test files are left out of the scan. */
const ALLOWED: Readonly<Record<string, string>> = {
  [RESOLVER]: 'the resolver itself',
  'src/apps/systemLookup.ts':
    "looks for CAD programs in the system's program folders and registry, never at a path from a plan, "
    + 'an agent or a command line; no command or tool imports it (checked below)',
  'src/sheet/fonts.ts':
    "registers Grid's own bundled fonts from its install folder (VEW-7), never a path from a plan, "
    + 'an agent or a command line',
  'src/fs/memoryProject.ts':
    "the hosted server's project in memory (AIV-19): it overrides the resolver's methods, so it has their names, "
    + 'and imports no file module: the plan a call carries is all it holds',
  'bin/grid.mjs':'the launcher checks that its own built file, next to it, exists',
  'build.mjs': 'the build script, run by developers and CI, writes dist/',
  'pack.mjs': 'packs the built command and its install files into dist/release/ (CMD-9), run by developers and CI',
}

const NODE_FILE_MODULES = '(?:node:)?(?:fs|fs/promises|child_process|worker_threads|module)'

/** What counts as reaching the disk, by its text. */
const FILE_ACCESS: ReadonlyArray<readonly [what: string, pattern: RegExp]> = [
  ['imports a Node module that reaches files or other programs', new RegExp(`from\\s*['"]${NODE_FILE_MODULES}['"]`)],
  ['requires a Node module that reaches files or other programs', new RegExp(`require\\(\\s*['"]${NODE_FILE_MODULES}['"]\\s*\\)`)],
  ['imports a Node module that reaches files or other programs at run time', new RegExp(`import\\(\\s*['"]${NODE_FILE_MODULES}['"]\\s*\\)`)],
  ['writes through the atomic writer, which only the resolver may call', /\batomicWrite(File|Json)?\b/],
  [
    // A method of the project (`project.writeFile(...)`) is the resolver, so it is not counted.
    'calls a file function',
    /(?<!\bproject\.)\b(readFile|writeFile|appendFile|open|opendir|readdir|mkdir|mkdtemp|rename|rm|rmdir|unlink|stat|lstat|realpath|exists|access|copyFile|cp|symlink|link|chmod|chown|truncate|utimes)(Sync)?(\.native)?\s*\(/,
  ],
  ['streams a file', /\bcreate(Read|Write)Stream\s*\(/],
  ['reaches the runtime around its modules', /\bprocess\.(binding|dlopen|getBuiltinModule)\b/],
  ['makes its own require', /\bcreateRequire\b/],
  ['imports a module named at run time', /\bimport\(\s*(?!['"])/],
  ['lets the canvas read fonts by their path', /\b(registerFromPath|loadFontsFromDir|loadSystemFonts)\b/],
  // @napi-rs/canvas reads a file when given a path; Grid hands it bytes.
  ['lets the canvas read a file by its path', /\bloadImage\s*\((?!\s*Buffer\.from\()/],
]

/** The code without its comments, so a comment can name what it doesn't do. Line numbers kept. */
function code(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')
}

function filesUnder(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name)
    if (entry.isDirectory()) return entry.name === 'node_modules' || entry.name === 'dist' ? [] : filesUnder(path)
    return /\.(ts|tsx|mts|cts|js|mjs|cjs)$/.test(entry.name) ? [path] : []
  })
}

function isTest(file: string): boolean {
  return file.split('/').includes('__tests__') || /\.test\.[cm]?[jt]sx?$/.test(file)
}

/** `file:line: what` for every line that reaches the disk. */
function findFileAccess(file: string, text: string): string[] {
  return code(text).split('\n').flatMap((line, i) =>
    FILE_ACCESS.filter(([, pattern]) => pattern.test(line)).map(([what]) => `${file}:${i + 1}: ${what}: ${line.trim()}`))
}

const sources = [...filesUnder(join(cli, 'src')), ...filesUnder(join(cli, 'bin')), join(cli, 'build.mjs'), join(cli, 'pack.mjs')]
  .map((path) => relative(cli, path).split(sep).join('/'))

describe('file access in packages/cli', () => {
  it('goes through the resolver everywhere outside the allowed files and the tests', () => {
    const found = sources
      .filter((file) => !isTest(file) && !(file in ALLOWED))
      .flatMap((file) => findFileAccess(file, readFileSync(join(cli, file), 'utf8')))
    expect(found).toEqual([])
  })

  it('allows only files that exist and do reach the disk, so the list never goes stale', () => {
    for (const file of Object.keys(ALLOWED)) {
      expect(sources).toContain(file)
      expect(findFileAccess(file, readFileSync(join(cli, file), 'utf8')).length).toBeGreaterThan(0)
    }
  })

  it.each([
    ["import { readFileSync } from 'fs'", 'imports a Node module'],
    ['import fs from "node:fs/promises"', 'imports a Node module'],
    ["import { execFile } from 'child_process'", 'imports a Node module'],
    ["const fs = require('fs')", 'requires a Node module'],
    ["const fs = await import('node:fs')", 'at run time'],
    ['atomicWriteFile(out, data)', 'atomic writer'],
    ['fs.promises.writeFile(out, data)', 'calls a file function'],
    ['fsp.readdir(dir)', 'calls a file function'],
    ['realpathSync.native(dir)', 'calls a file function'],
    ['existsSync (file)', 'calls a file function'],
    ['createWriteStream(out)', 'streams a file'],
    ["process.binding('fs')", 'around its modules'],
    ["const { writeFileSync: w } = process.getBuiltinModule('node:fs')", 'around its modules'],
    ['const req = createRequire(import.meta.url)', 'makes its own require'],
    ['await import(`node:${name}`)', 'named at run time'],
    ['await import(name)', 'named at run time'],
    ["GlobalFonts.registerFromPath('/x.ttf')", 'fonts by their path'],
    ['await loadImage(file)', 'by its path'],
  ])('catches %j', (line, what) => {
    expect(findFileAccess('x.ts', line).join('\n')).toContain(what)
  })

  it('lets comments, strings in comments and bytes for the canvas through', () => {
    expect(findFileAccess('x.ts', [
      '// Nothing here may call readFileSync(file).',
      "/* import fs from 'fs' */",
      'const image = await loadImage(Buffer.from(svg))',
      'project.writeFile(out, data)',
      "const { createCanvas } = await import('@napi-rs/canvas')",
      "const url = 'https://example.invalid/a' // not a comment start inside a string",
    ].join('\n'))).toEqual([])
  })
})

describe('what the command and the tool server run', () => {
  it.each([
    ['grid and ongrid', 'src/command/bin.ts'],
    ['the tool server on its own', 'src/mcp/server.ts'],
  ])('%s reach Node\'s file and process modules only through the resolver', async (_, entry) => {
    const result = await build({
      entryPoints: [join(cli, entry)],
      bundle: true,
      platform: 'node',
      format: 'esm',
      external: ['@napi-rs/canvas'],
      write: false,
      metafile: true,
      logLevel: 'silent',
    })
    const builtIn = new RegExp(`^${NODE_FILE_MODULES}$`)
    const reaching = Object.entries(result.metafile.inputs)
      .filter(([, input]) => input.imports.some((imported) => builtIn.test(imported.path)))
      .map(([input]) => relative(cli, resolve(process.cwd(), input)).split(sep).join('/'))
    expect(reaching.sort()).toEqual([WRITER, RESOLVER].sort())
    // Only the resolver imports the writer.
    const writerImporters = Object.entries(result.metafile.inputs)
      .filter(([, input]) => input.imports.some((imported) => imported.path.endsWith('rules/src/store/atomicWrite.ts')))
      .map(([input]) => relative(cli, resolve(process.cwd(), input)).split(sep).join('/'))
    expect(writerImporters).toEqual([RESOLVER])
    expect(Object.keys(result.metafile.inputs).some((input) => input.endsWith('systemLookup.ts'))).toBe(false)
  }, 30_000)
})
