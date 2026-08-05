import { describe, expect, it } from 'vitest'
import {
  createCloudBaseCli,
  normalizeCloudBaseCliCommand,
} from '../../tools/asset-pipeline/cloudbase-cli'

describe('CloudBase CLI adapter', () => {
  it('resolves the Windows npm command shim for real CLI execution', () => {
    expect(normalizeCloudBaseCliCommand('tcb', 'win32')).toEqual({
      command: 'cmd.exe',
      argsPrefix: ['/d', '/c'],
      executable: 'tcb.cmd',
    })
    expect(normalizeCloudBaseCliCommand('custom-cli', 'linux')).toEqual({
      command: 'custom-cli',
      argsPrefix: [],
      executable: 'custom-cli',
    })
  })

  it('checks that a versioned path is absent before uploading and returns fileID from detail', async () => {
    const calls: Array<{ command: string; args: readonly string[] }> = []
    let detailCalls = 0
    const cli = createCloudBaseCli({
      command: 'tcb',
      envId: 'uwo-prod-123',
      run: async (command, args) => {
        calls.push({ command, args })
        if (args.includes('detail')) {
          detailCalls += 1
          return detailCalls === 1
            ? { code: 1, stdout: '', stderr: 'not found' }
            : {
                code: 0,
                stdout: '{"fileID":"cloud://uwo-prod-123/assets/release/a.png"}',
                stderr: '',
              }
        }
        if (args.includes('upload')) {
          return { code: 0, stdout: '{"uploaded":true}', stderr: '' }
        }
        if (args.includes('--json')) {
          return {
            code: 0,
            stdout: '{"fileID":"cloud://uwo-prod-123/assets/release/a.png"}',
            stderr: '',
          }
        }
        return { code: 0, stdout: '', stderr: '' }
      },
    })

    await expect(
      cli.upload({
        sourcePath: 'miniprogram/subpkg-assets-0/imgs/a.png',
        cloudPath: 'assets/1.0.0-aaaaaaaaaaaa/a.png',
        contentType: 'image/png',
        cacheControl: 'public, max-age=31536000, immutable',
      }),
    ).resolves.toEqual({ fileID: 'cloud://uwo-prod-123/assets/release/a.png' })

    expect(calls.some(({ args }) => args.includes('detail'))).toBe(true)
    const uploadCall = calls.find(({ args }) => args.includes('upload'))
    expect(uploadCall?.args).not.toContain('image/png')
    expect(uploadCall?.args).not.toContain('public, max-age=31536000, immutable')
    expect(uploadCall?.args).not.toContain('--upsert')
  })

  it('refuses to upload when a versioned cloud path already exists', async () => {
    const cli = createCloudBaseCli({
      envId: 'uwo-prod-123',
      run: async (_command, args) =>
        args.includes('detail')
          ? { code: 0, stdout: '{"fileID":"cloud://existing"}', stderr: '' }
          : { code: 0, stdout: '', stderr: '' },
    })

    await expect(
      cli.upload({
        sourcePath: 'miniprogram/subpkg-assets-0/imgs/a.png',
        cloudPath: 'assets/1.0.0-aaaaaaaaaaaa/a.png',
        contentType: 'image/png',
        cacheControl: 'public, max-age=31536000, immutable',
      }),
    ).rejects.toThrow(/already exists|覆盖/)
  })

  it('surfaces permission failures instead of treating them as missing objects', async () => {
    const cli = createCloudBaseCli({
      envId: 'uwo-prod-123',
      run: async () => ({ code: 1, stdout: '', stderr: 'permission denied' }),
    })

    await expect(
      cli.upload({
        sourcePath: 'miniprogram/subpkg-assets-0/imgs/a.png',
        cloudPath: 'assets/1.0.0-aaaaaaaaaaaa/a.png',
        contentType: 'image/png',
        cacheControl: 'public, max-age=31536000, immutable',
      }),
    ).rejects.toThrow(/permission denied/)
  })

  it('accepts only the public-read/admin-write storage ACL', async () => {
    const calls: Array<readonly string[]> = []
    const cli = createCloudBaseCli({
      envId: 'uwo-prod-123',
      run: async (_command, args) => {
        calls.push(args)
        return { code: 0, stdout: '{"data":{"acl":"ADMINWRITE"}}', stderr: '' }
      },
    })

    await expect(cli.assertPublicReadAdminWrite!()).resolves.toBeUndefined()
    expect(calls[0]).toEqual(['storage', 'rules', 'get', '--json', '-e', 'uwo-prod-123'])
  })

  it('rejects the public-read/creator-write storage ACL', async () => {
    const cli = createCloudBaseCli({
      envId: 'uwo-prod-123',
      run: async () => ({ code: 0, stdout: '{"acl":"READONLY"}', stderr: '' }),
    })

    await expect(cli.assertPublicReadAdminWrite!()).rejects.toThrow(/ADMINWRITE/)
  })

  it('constructs a fileID from the storage bucket when CLI detail omits fileID', async () => {
    let detailCalls = 0
    const cli = createCloudBaseCli({
      envId: 'uwo-prod-123',
      run: async (_command, args) => {
        if (args.includes('env') && args.includes('detail')) {
          return {
            code: 0,
            stdout:
              'i 提示：附加 --yes 参数可使用非交互模式\n{"data":{"resources":{"storages":[{"Bucket":"636c-uwo-prod-123-1463074076"}]}}}',
            stderr: '',
          }
        }
        if (args.includes('detail')) {
          detailCalls += 1
          return detailCalls === 1
            ? { code: 1, stdout: '', stderr: 'not found' }
            : { code: 0, stdout: '{"data":{"size":"8.27","type":"image/png"}}', stderr: '' }
        }
        if (args.includes('upload')) return { code: 0, stdout: '', stderr: '' }
        return { code: 0, stdout: '', stderr: '' }
      },
    })

    await expect(
      cli.upload({
        sourcePath: 'miniprogram/assets/officer_chasab001.png',
        cloudPath: 'assets/release/officer_chasab001.png',
        contentType: 'image/png',
        cacheControl: 'public, max-age=31536000, immutable',
      }),
    ).resolves.toEqual({
      fileID:
        'cloud://uwo-prod-123.636c-uwo-prod-123-1463074076/assets/release/officer_chasab001.png',
    })
  })

  it('supports a version-directory upload and deterministic fileID lookup', async () => {
    const calls: Array<readonly string[]> = []
    const cli = createCloudBaseCli({
      envId: 'uwo-prod-123',
      run: async (_command, args) => {
        calls.push(args)
        if (args.includes('env') && args.includes('detail')) {
          return {
            code: 0,
            stdout:
              '{"data":{"resources":{"storages":[{"Bucket":"636c-uwo-prod-123-1463074076"}]}}}',
            stderr: '',
          }
        }
        if (args.includes('detail')) return { code: 1, stdout: '', stderr: '404 Not Found' }
        if (args.includes('list')) return { code: 0, stdout: '{"data":[]}', stderr: '' }
        return { code: 0, stdout: '', stderr: '' }
      },
    })

    await expect(cli.assertCloudPrefixAbsent!('assets/1.0.0-aaaaaaaaaaaa')).resolves.toBeUndefined()
    await expect(
      cli.uploadDirectory!({
        sourceDirectory: 'C:/tmp/release',
        cloudPath: 'assets/1.0.0-aaaaaaaaaaaa',
      }),
    ).resolves.toBeUndefined()
    await expect(cli.fileIDFor!('assets/1.0.0-aaaaaaaaaaaa/officer-a.png')).resolves.toBe(
      'cloud://uwo-prod-123.636c-uwo-prod-123-1463074076/assets/1.0.0-aaaaaaaaaaaa/officer-a.png',
    )

    expect(calls).toContainEqual([
      'storage',
      'list',
      'assets/1.0.0-aaaaaaaaaaaa',
      '-e',
      'uwo-prod-123',
      '--json',
    ])
    expect(calls).toContainEqual([
      'storage',
      'upload',
      'C:/tmp/release',
      'assets/1.0.0-aaaaaaaaaaaa',
      '-e',
      'uwo-prod-123',
      '--yes',
    ])
  })
})
