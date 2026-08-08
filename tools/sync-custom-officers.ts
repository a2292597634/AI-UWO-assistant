/**
 * CloudBase 自定义航海士同步脚本
 *
 * 从 CloudBase custom_officers 集合下载所有自定义航海士，
 * 写入 data/master/custom-officers.json，供数据流水线使用。
 *
 * 使用方式：npm run sync:custom-officers
 * 需要 CloudBase 管理凭证（通过环境变量或 tcb 登录）。
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { execSync } from 'node:child_process'

const PROJECT_ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..')
const MASTER_DIR = resolve(PROJECT_ROOT, 'data', 'master')
const OUTPUT_FILE = resolve(MASTER_DIR, 'custom-officers.json')

/**
 * 通过 tcb CLI 调用云函数获取自定义航海士列表。
 * 需要先安装并登录 tcb：npm i -g @cloudbase/cli && tcb login
 */
async function fetchCustomOfficers(): Promise<Record<string, unknown>[]> {
  try {
    // 通过 tcb fn invoke 调用云函数
    const result = execSync(
      `tcb fn invoke officer-custom --params '{"action":"listCustom"}'`,
      { encoding: 'utf8', cwd: PROJECT_ROOT },
    )
    const parsed = JSON.parse(result) as {
      ok?: boolean
      data?: { officers?: Record<string, unknown>[] }
    }
    if (parsed?.ok && parsed?.data?.officers) {
      return parsed.data.officers
    }
    console.error('云函数返回异常:', result)
    return []
  } catch (err) {
    console.error('调用云函数失败（请确保已安装并登录 tcb CLI）:', err)
    return []
  }
}

/**
 * 合并自定义航海士到 master 文件。
 * 如果 custom-officers.json 已存在，保留被批准（approved）的条目。
 */
async function sync(): Promise<void> {
  console.log('[sync:custom-officers] 开始同步...')

  // 获取云端数据
  const cloudOfficers = await fetchCustomOfficers()
  console.log(`  从 CloudBase 获取到 ${cloudOfficers.length} 条记录`)

  if (cloudOfficers.length === 0) {
    console.log('  没有需要同步的数据')
    return
  }

  // 读取本地已有数据（如有）
  let existingOfficers: Record<string, unknown>[] = []
  if (existsSync(OUTPUT_FILE)) {
    try {
      existingOfficers = JSON.parse(
        readFileSync(OUTPUT_FILE, 'utf8'),
      ) as Record<string, unknown>[]
      console.log(`  本地已有 ${existingOfficers.length} 条记录`)
    } catch {
      console.log('  本地文件解析失败，将覆盖')
    }
  }

  // 合并：云端数据覆盖本地同 ID 条目，本地独有数据保留
  const mergedMap = new Map<string, Record<string, unknown>>()
  for (const officer of existingOfficers) {
    const id = officer.id as string
    if (id) mergedMap.set(id, officer)
  }
  for (const officer of cloudOfficers) {
    const id = officer.id as string
    if (id) mergedMap.set(id, officer)
  }

  const merged = [...mergedMap.values()]
  writeFileSync(OUTPUT_FILE, JSON.stringify(merged, null, 2) + '\n', 'utf8')
  console.log(`  已写入 ${merged.length} 条记录到 data/master/custom-officers.json`)

  // 提示后续步骤
  console.log('')
  console.log('后续步骤：')
  console.log('  1. npm run data:generate   # 重新生成运行时数据')
  console.log('  2. npm run verify          # 验证全量门禁')
  console.log('  3. git add & commit       # 提交更新')
}

sync().catch((err) => {
  console.error('同步失败:', err)
  process.exit(1)
})
