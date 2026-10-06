import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, parse, relative, resolve } from 'node:path'
import { isBuiltin } from 'node:module'
import ts from 'typescript'
import { CLOUDBASE_ENV_ID } from '../../miniprogram/runtime/cloudbase-config'
import { assertSafeInputPath } from '../workflow/read-inputs'

export interface ProbeBuild {
  candidateSha: string
  buildSha: string
  packages: { name: string; path: string; sha256: string }[]
}

function checkedSource(root: string, path: string): Buffer {
  const file = assertSafeInputPath(root, path)
  if (!existsSync(file)) throw new Error('PROBE_SOURCE_MISSING: ' + path)
  return readFileSync(file)
}

function checkRequires(name: string, bytes: Buffer): void {
  const file = ts.createSourceFile(
    name,
    bytes.toString('utf8'),
    ts.ScriptTarget.ES2022,
    true,
    ts.ScriptKind.JS,
  )
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'require'
    ) {
      const value = node.arguments[0]
      if (
        !value ||
        !ts.isStringLiteral(value) ||
        (!isBuiltin(value.text) &&
          !['./shared', './shared.js', './private-avatar'].includes(value.text))
      ) {
        throw new Error('PROBE_REQUIRE_UNSAFE: ' + name)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
}

/** 只產生停用狀態的探測包，不安裝 SDK、不上傳或部署。 */
export function buildProbePackages(input: {
  sourceRoot: string
  outputRoot: string
  candidateSha: string
  sharedEnvironment?: {
    environmentId: string
    runId: string
    expiresAt: string
    scope?: 'identity-text' | 'transport-only' | 'private-avatar-callback'
  }
}): ProbeBuild {
  if (!/^[a-f0-9]{40}$/.test(input.candidateSha)) throw new Error('PROBE_CANDIDATE_INVALID')
  const shared = input.sharedEnvironment
  if (shared) {
    const expiresAt = Date.parse(shared.expiresAt)
    if (
      shared.environmentId !== CLOUDBASE_ENV_ID ||
      (shared.scope !== undefined &&
        !['identity-text', 'transport-only', 'private-avatar-callback'].includes(shared.scope)) ||
      !/^g0-shared-[a-z0-9_-]{1,50}$/.test(shared.runId) ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(shared.expiresAt) ||
      !Number.isFinite(expiresAt) ||
      expiresAt <= Date.now() ||
      expiresAt - Date.now() > 86400000
    )
      throw new Error('PROBE_SHARED_AUTHORIZATION_INVALID')
  }
  const sharedEnvironmentAuthorization = shared
    ? { ...shared, scope: shared.scope || 'identity-text' }
    : null
  const sourceRoot = resolve(input.sourceRoot)
  const outputRoot = resolve(input.outputRoot)
  const child = relative(sourceRoot, outputRoot).replace(/\\/g, '/')
  if (
    !child ||
    (!child.startsWith('../') &&
      !isAbsolute(child) &&
      !child.startsWith('artifacts/message-board-probes/'))
  )
    throw new Error('PROBE_OUTPUT_UNSAFE')
  // 由已存在的磁碟根逐層檢查，允許尚未建立的子目錄，仍拒絕 symlink／junction。
  assertSafeInputPath(parse(outputRoot).root, outputRoot)
  if (existsSync(outputRoot) && readdirSync(outputRoot).length)
    throw new Error('PROBE_OUTPUT_NOT_EMPTY')
  const sdk = JSON.parse(
    checkedSource(sourceRoot, 'cloudfunctions/officer-maintenance/package.json').toString('utf8'),
  ) as {
    dependencies?: Record<string, string>
  }
  if (sdk.dependencies?.['wx-server-sdk'] !== '4.0.2')
    throw new Error('PROBE_SDK_VERSION_UNSUPPORTED')
  const modes = ['rpc', 'callback', 'worker'] as const
  const sources = new Map<string, Buffer>()
  for (const name of ['shared', 'private-avatar', ...modes]) {
    const bytes = checkedSource(sourceRoot, 'tools/message-board/probe-sources/' + name + '.js')
    checkRequires(name, bytes)
    sources.set(name, bytes)
  }
  const hash = createHash('sha256')
  hash.update(checkedSource(sourceRoot, 'tools/message-board/build-probe-package.ts'))
  hash.update(
    JSON.stringify([
      input.candidateSha,
      CLOUDBASE_ENV_ID,
      sdk.dependencies,
      sharedEnvironmentAuthorization,
    ]),
  )
  for (const [name, bytes] of sources) {
    hash.update(name)
    hash.update(bytes)
  }
  const buildSha = hash.digest('hex')
  const packages: ProbeBuild['packages'] = []
  for (const mode of modes) {
    const name = 'message-board-g0-' + mode
    const path = join(outputRoot, name)
    const index = [
      '/* global exports, require, process */',
      '/* eslint-disable @typescript-eslint/no-require-imports */',
      "const cloud = require('wx-server-sdk')",
      "const { createProbe } = require('./probe')",
      'cloud.init({env:cloud.DYNAMIC_CURRENT_ENV})',
      'exports.main = async (event, context) => {',
      '  const config = {',
      "    enabled: process.env.MESSAGE_BOARD_PROBE_ENABLED === 'true',",
      "    testEnvironmentId: process.env.MESSAGE_BOARD_PROBE_TEST_ENV || '',",
      '    productionEnvironmentId: ' + JSON.stringify(CLOUDBASE_ENV_ID) + ',',
      '    sharedEnvironmentAuthorization: ' + JSON.stringify(sharedEnvironmentAuthorization) + ',',
      "    appId: process.env.MESSAGE_BOARD_PROBE_APP_ID || '',",
      "    runId: process.env.MESSAGE_BOARD_PROBE_RUN_ID || '',",
      '    candidateSha: ' + JSON.stringify(input.candidateSha) + ',',
      '    buildSha: ' + JSON.stringify(buildSha) + ',',
      "    allowedActorHashes: (process.env.MESSAGE_BOARD_PROBE_ACTOR_HASHES || '').split(',').map(x=>x.trim()).filter(x=>/^[a-f0-9]{64}$/.test(x)),",
      "    token: process.env.MESSAGE_BOARD_PROBE_CALLBACK_TOKEN || '',",
      "    encodingAESKey: process.env.MESSAGE_BOARD_PROBE_AES_KEY || '',",
      "    timerSource: process.env.MESSAGE_BOARD_PROBE_TIMER_SOURCE || '',",
      "    imageSigningKey: process.env.MESSAGE_BOARD_PROBE_IMAGE_KEY || '',",
      "    privateAvatarBaseUrl: process.env.MESSAGE_BOARD_PROBE_HTTP_URL || '',",
      "    platformEnvironmentId: process.env.TCB_ENV || '',",
      "    platformNamespace: process.env.SCF_NAMESPACE || '',",
      '  }',
      '  return createProbe(cloud,config)(event,context)',
      '}',
      '',
    ].join('\n')
    const files = new Map<string, Buffer>([
      ['index.js', Buffer.from(index)],
      ['probe.js', sources.get(mode)!],
      ['shared.js', sources.get('shared')!],
      ['private-avatar.js', sources.get('private-avatar')!],
      [
        'package.json',
        Buffer.from(
          JSON.stringify(
            {
              name,
              version: '1.0.0',
              private: true,
              main: 'index.js',
              dependencies: { 'wx-server-sdk': '4.0.2' },
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
            {
              permissions: {
                openapi:
                  mode !== 'rpc'
                    ? []
                    : shared
                      ? sharedEnvironmentAuthorization?.scope === 'private-avatar-callback'
                        ? ['security.mediaCheckAsync']
                        : sharedEnvironmentAuthorization?.scope === 'transport-only'
                          ? []
                          : ['security.msgSecCheck']
                      : ['security.msgSecCheck', 'security.mediaCheckAsync'],
              },
            },
            null,
            2,
          ) + '\n',
        ),
      ],
    ])
    const packageHash = createHash('sha256')
    mkdirSync(path, { recursive: true })
    for (const [file, bytes] of files) {
      packageHash.update(file)
      packageHash.update(bytes)
      writeFileSync(join(path, file), bytes)
    }
    packages.push({ name, path, sha256: packageHash.digest('hex') })
  }
  const result = { candidateSha: input.candidateSha, buildSha, packages }
  writeFileSync(
    join(outputRoot, 'manifest.json'),
    JSON.stringify(
      {
        schemaVersion: 1,
        candidateSha: input.candidateSha,
        buildSha,
        enabledByDefault: false,
        sharedEnvironmentAuthorization,
        dependencies: { 'wx-server-sdk': '4.0.2' },
        packages: packages.map(({ name, sha256 }) => ({ name, sha256 })),
      },
      null,
      2,
    ) + '\n',
  )
  return result
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('tools/message-board/build-probe-package.ts')) {
  const args = process.argv.slice(2)
  const output = args.indexOf('--output')
  const candidate = args.indexOf('--candidate')
  const shared = args.indexOf('--shared-environment')
  const run = args.indexOf('--run-id')
  const expires = args.indexOf('--expires-at')
  const scope = args.indexOf('--scope')
  try {
    const keys = args.filter((_value, index) => index % 2 === 0)
    if (
      ![4, 10, 12].includes(args.length) ||
      new Set(keys).size !== keys.length ||
      keys.some(
        (key) =>
          ![
            '--output',
            '--candidate',
            '--shared-environment',
            '--run-id',
            '--expires-at',
            '--scope',
          ].includes(key),
      ) ||
      (args.length >= 10 && (shared < 0 || run < 0 || expires < 0)) ||
      (args.length === 12 && scope < 0) ||
      (scope >= 0 && shared < 0) ||
      output < 0 ||
      candidate < 0 ||
      !args[output + 1] ||
      !args[candidate + 1]
    ) {
      throw new Error(
        '用法：--output <新的輸出目錄> --candidate <40字元候選SHA> [--shared-environment <已授權環境> --run-id <g0-shared-批次> --expires-at <ISO UTC> [--scope <identity-text|transport-only|private-avatar-callback>]]',
      )
    }
    console.log(
      JSON.stringify(
        buildProbePackages({
          sourceRoot: process.cwd(),
          outputRoot: args[output + 1],
          candidateSha: args[candidate + 1],
          ...(shared < 0
            ? {}
            : {
                sharedEnvironment: {
                  environmentId: args[shared + 1],
                  runId: args[run + 1],
                  expiresAt: args[expires + 1],
                  ...(scope < 0
                    ? {}
                    : {
                        scope: args[scope + 1] as
                          'identity-text' | 'transport-only' | 'private-avatar-callback',
                      }),
                },
              }),
        }),
        null,
        2,
      ),
    )
  } catch (error) {
    console.error(error instanceof Error ? error.message : '組包失敗')
    process.exitCode = 1
  }
}
