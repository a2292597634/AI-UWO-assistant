import { builtinModules } from 'node:module'
import { createHash } from 'node:crypto'
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'

function files(root: string): string[] {
  if (lstatSync(root).isSymbolicLink()) throw new Error('SOURCE_LINK_FORBIDDEN')
  return readdirSync(root, { withFileTypes: true })
    .flatMap((entry) => {
      const file = join(root, entry.name)
      if (entry.isSymbolicLink()) throw new Error('SOURCE_LINK_FORBIDDEN')
      return entry.isDirectory() ? files(file) : [file]
    })
    .sort()
}
export function validatePackageRequires(root: string): string[] {
  const failures: string[] = []
  for (const file of files(root).filter((file) => file.endsWith('.js'))) {
    const code = readFileSync(file, 'utf8')
    const matches = [...code.matchAll(/require\(\s*(['"])([^'"]+)\1\s*\)/g)]
    if ((code.match(/\brequire\s*\(/g) || []).length !== matches.length)
      failures.push(relative(root, file) + ':dynamic-require')
    for (const match of matches) {
      const name = match[2]
      if (name === 'wx-server-sdk' || builtinModules.includes(name.replace(/^node:/, ''))) continue
      if (!name.startsWith('.')) {
        failures.push(name + ':dependency-forbidden')
        continue
      }
      const target = resolve(dirname(file), name),
        child = relative(resolve(root), target)
      if (
        child.startsWith('..') ||
        isAbsolute(child) ||
        ![target, target + '.js', target + '.json'].some(existsSync)
      )
        failures.push(relative(root, file) + ':' + name)
    }
  }
  return failures
}
export function buildDeployPackages(input: { sourceRoot: string; outputRoot: string }) {
  const root = resolve(input.sourceRoot),
    output = resolve(input.outputRoot)
  if (existsSync(output)) throw new Error('OUTPUT_ALREADY_EXISTS')
  const core = join(root, 'cloudfunctions/message-board/core'),
    catalog = readFileSync(join(root, 'cloudfunctions/message-board/game-servers.json'))
  const coreFiles = files(core).filter((file) => file.endsWith('.js'))
  const packages = []
  for (const name of ['message-board', 'message-board-events']) {
    const declared = JSON.parse(
      readFileSync(join(root, 'cloudfunctions', name, 'package.json'), 'utf8'),
    ) as { dependencies: Record<string, string> }
    if (JSON.stringify(declared.dependencies) !== JSON.stringify({ 'wx-server-sdk': '4.0.2' }))
      throw new Error('SDK_DEPENDENCY_DRIFT')
    let entry = readFileSync(join(root, 'cloudfunctions', name, 'entry.js'), 'utf8')
    if (name === 'message-board-events')
      entry = entry.replace(
        "require('../message-board/core/wechat-event-crypto')",
        "require('./shared/core/wechat-event-crypto')",
      )
    const entries = new Map<string, Buffer>([
      ['entry.js', Buffer.from(entry)],
      ['shared/game-servers.json', catalog],
      [
        'package.json',
        Buffer.from(
          JSON.stringify(
            {
              name: 'uwo-' + name,
              version: '1.0.0',
              private: true,
              main: 'index.js',
              dependencies: declared.dependencies,
            },
            null,
            2,
          ) + '\n',
        ),
      ],
      [
        'config.json',
        Buffer.from(
          JSON.stringify(
            { permissions: { openapi: ['security.msgSecCheck', 'security.mediaCheckAsync'] } },
            null,
            2,
          ) + '\n',
        ),
      ],
      [
        'index.js',
        Buffer.from(
          "// 工具生成的永久業務入口；權限與開關由服務端配置。\nconst cloud=require('wx-server-sdk')\ncloud.init({env:cloud.DYNAMIC_CURRENT_ENV})\nconst assembly=require('./shared/core/assembly')\nconst entry=require('./entry')\nexports.main=entry." +
            (name === 'message-board'
              ? 'createRpcEntry(assembly.createRuntimePorts(cloud))'
              : 'createEventsEntry(assembly.createEventsPorts(cloud))') +
            '\n',
        ),
      ],
    ])
    for (const file of coreFiles)
      entries.set('shared/core/' + relative(core, file).replace(/\\/g, '/'), readFileSync(file))
    const path = join(output, name),
      hash = createHash('sha256')
    for (const [file, bytes] of [...entries].sort(([a], [b]) => a.localeCompare(b))) {
      hash.update(file)
      hash.update(bytes)
      mkdirSync(dirname(join(path, file)), { recursive: true })
      writeFileSync(join(path, file), bytes)
    }
    const errors = validatePackageRequires(path)
    if (errors.length) throw new Error('PACKAGE_REQUIRE_INVALID:' + errors.join(','))
    packages.push({ name, path, sha256: hash.digest('hex') })
  }
  const manifest = {
    schemaVersion: 1,
    enabledByDefault: false,
    packages,
    serverCatalogVersion: (JSON.parse(catalog.toString()) as { version: string }).version,
  }
  writeFileSync(
    join(output, 'manifest.json'),
    JSON.stringify(
      { ...manifest, packages: packages.map(({ name, sha256 }) => ({ name, sha256 })) },
      null,
      2,
    ) + '\n',
  )
  return manifest
}
