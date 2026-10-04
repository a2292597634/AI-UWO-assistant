import { collectPreflight, type PreflightScope } from './preflight'

export function runPreflightCli(args: string[]): number {
  if (
    args[0] !== 'preflight' ||
    args.some((v, i) => i > 0 && !['--scope', 'repository', 'page', '--json'].includes(v))
  )
    throw new Error('用法：preflight [--scope repository|page] [--json]')
  const index = args.indexOf('--scope')
  const scope = index < 0 ? 'repository' : args[index + 1]
  if (scope !== 'repository' && scope !== 'page') throw new Error('scope 必須為 repository 或 page')
  const report = collectPreflight({
    projectRoot: process.cwd(),
    scope: scope as PreflightScope,
    nodeVersion: process.version,
    npmVersion:
      /(?:^|\s)npm\/(\d+\.\d+\.\d+)(?:\s|$)/.exec(process.env.npm_config_user_agent ?? '')?.[1] ??
      '',
    platform: process.platform,
    env: process.env,
  })
  if (args.includes('--json')) console.log(JSON.stringify(report, null, 2))
  else {
    for (const item of report.items)
      console.log(item.level + ' ' + item.code + '：' + item.message, item.paths.join('；'))
    console.log('只讀預檢：' + (report.ready ? '靜態前置條件就緒' : '未就緒'))
  }
  return report.ready ? 0 : 1
}
if (process.argv[1]?.replace(/\\/g, '/').endsWith('tools/workflow/cli.ts')) {
  try {
    process.exitCode = runPreflightCli(process.argv.slice(2))
  } catch (error) {
    console.error(error)
    process.exitCode = 1
  }
}
