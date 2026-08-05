export interface CloudBaseCommandResult {
  code: number
  stdout: string
  stderr: string
}

export type CloudBaseCommandRunner = (
  command: string,
  args: readonly string[],
) => Promise<CloudBaseCommandResult>

export interface CloudBaseUploadInput {
  sourcePath: string
  cloudPath: string
  contentType: 'image/png'
  cacheControl: string
}

export interface CloudBaseCli {
  assertPublicReadAdminWrite?(): Promise<void>
  assertCloudPathAbsent?(cloudPath: string): Promise<void>
  assertCloudPrefixAbsent?(cloudPathPrefix: string): Promise<void>
  upload(input: CloudBaseUploadInput): Promise<{ fileID: string }>
  uploadDirectory?(input: { sourceDirectory: string; cloudPath: string }): Promise<void>
  fileIDFor?(cloudPath: string): Promise<string>
}

interface CloudBaseCliOptions {
  envId: string
  command?: string
  run: CloudBaseCommandRunner
}

const commandOutput = (result: CloudBaseCommandResult): string =>
  [result.stdout, result.stderr].filter(Boolean).join('\n')

const isNotFound = (result: CloudBaseCommandResult): boolean =>
  /not found|does not exist|no such file|404/i.test(commandOutput(result))

const parseJson = (result: CloudBaseCommandResult): Record<string, unknown> => {
  try {
    const start = result.stdout.indexOf('{')
    const end = result.stdout.lastIndexOf('}')
    const payload = start >= 0 && end >= start ? result.stdout.slice(start, end + 1) : result.stdout
    return JSON.parse(payload) as Record<string, unknown>
  } catch {
    throw new Error(`CloudBase CLI returned invalid JSON: ${commandOutput(result)}`)
  }
}

const fileIDFrom = (data: Record<string, unknown>): string | null => {
  const value = data.fileID ?? data.FileID ?? data.fileId ?? data.id ?? data.Id
  return typeof value === 'string' && value.startsWith('cloud://') ? value : null
}

const storageBucketFrom = (data: Record<string, unknown>): string | null => {
  const envelope = data.data
  if (!envelope || typeof envelope !== 'object') return null
  const resources = (envelope as Record<string, unknown>).resources
  if (!resources || typeof resources !== 'object') return null
  const storages = (resources as Record<string, unknown>).storages
  if (!Array.isArray(storages) || !storages.length) return null
  const bucket = (storages[0] as Record<string, unknown>)?.Bucket
  return typeof bucket === 'string' && bucket.trim() ? bucket : null
}

const errorFor = (operation: string, result: CloudBaseCommandResult): Error =>
  new Error(`CloudBase ${operation} failed: ${commandOutput(result)}`)

export const normalizeCloudBaseCliCommand = (
  command: string,
  platform: NodeJS.Platform = process.platform,
): { command: string; argsPrefix: string[]; executable: string } => {
  const executable = platform === 'win32' && command === 'tcb' ? 'tcb.cmd' : command
  if (platform === 'win32' && /\.(?:cmd|bat)$/i.test(executable)) {
    return {
      command: 'cmd.exe',
      argsPrefix: ['/d', '/c'],
      executable,
    }
  }
  return {
    command: executable,
    argsPrefix: [],
    executable,
  }
}

export const createCloudBaseCli = ({
  envId,
  command = 'tcb',
  run,
}: CloudBaseCliOptions): CloudBaseCli => {
  if (!envId.trim()) throw new Error('CloudBase CLI requires an environment ID')

  const execute = async (args: readonly string[]): Promise<CloudBaseCommandResult> =>
    run(command, args)
  let storageBucketPromise: Promise<string> | undefined
  const storageBucket = async (): Promise<string> => {
    storageBucketPromise ??= (async () => {
      const result = await execute(['env', 'detail', '-e', envId, '--json'])
      if (result.code !== 0) throw errorFor('environment detail', result)
      const bucket = storageBucketFrom(parseJson(result))
      if (!bucket) throw new Error('CloudBase environment detail did not contain a storage bucket')
      return bucket
    })()
    return storageBucketPromise
  }

  const assertCloudPathAbsent = async (cloudPath: string): Promise<void> => {
    const result = await execute(['storage', 'detail', cloudPath, '-e', envId, '--json'])
    if (result.code === 0)
      throw new Error(`CloudBase path already exists and cannot be overwritten: ${cloudPath}`)
    if (!isNotFound(result)) throw errorFor('path check', result)
  }

  const assertCloudPrefixAbsent = async (cloudPathPrefix: string): Promise<void> => {
    const result = await execute(['storage', 'list', cloudPathPrefix, '-e', envId, '--json'])
    if (result.code !== 0) throw errorFor('prefix check', result)
    const payload = parseJson(result)
    const entries = payload.data
    const count = Array.isArray(entries)
      ? entries.length
      : entries && typeof entries === 'object' && 'total' in entries
        ? Number(entries.total)
        : 0
    if (count > 0) {
      throw new Error(
        `CloudBase path prefix already contains objects and cannot be overwritten: ${cloudPathPrefix}`,
      )
    }
  }

  const fileIDFor = async (cloudPath: string): Promise<string> => {
    const bucket = await storageBucket()
    return `cloud://${envId}.${bucket}/${cloudPath}`
  }

  return {
    assertPublicReadAdminWrite: async () => {
      const result = await execute(['storage', 'rules', 'get', '--json', '-e', envId])
      if (result.code !== 0) throw errorFor('ACL check', result)
      const payload = parseJson(result)
      const nested = payload.data
      const nestedRecord = nested && typeof nested === 'object' ? nested : undefined
      const acl = nestedRecord && 'acl' in nestedRecord ? nestedRecord.acl : payload.acl
      if (acl !== 'ADMINWRITE') {
        throw new Error(
          `CloudBase storage ACL must be ADMINWRITE (public-read/admin-write): ${commandOutput(result)}`,
        )
      }
    },
    assertCloudPathAbsent,
    assertCloudPrefixAbsent,
    uploadDirectory: async ({ sourceDirectory, cloudPath }) => {
      const upload = await execute([
        'storage',
        'upload',
        sourceDirectory,
        cloudPath,
        '-e',
        envId,
        '--yes',
      ])
      if (upload.code !== 0) throw errorFor('directory upload', upload)
    },
    fileIDFor,
    upload: async (input) => {
      await assertCloudPathAbsent(input.cloudPath)
      const detailArgs = ['storage', 'detail', input.cloudPath, '-e', envId, '--json']

      const upload = await execute([
        'storage',
        'upload',
        input.sourcePath,
        input.cloudPath,
        '-e',
        envId,
      ])
      if (upload.code !== 0) throw errorFor('upload', upload)

      const detail = await execute(detailArgs)
      if (detail.code !== 0) throw errorFor('uploaded file detail', detail)
      const fileID = fileIDFrom(parseJson(detail))
      if (fileID) return { fileID }
      return { fileID: await fileIDFor(input.cloudPath) }
    },
  }
}
