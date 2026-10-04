import { createHash } from 'node:crypto'
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'

/** 只讀集合；逐層拒絕 symlink/junction，避免讀到另一棵樹。 */
export function assertSafeInputPath(root: string, path: string): string {
  const base = resolve(root)
  const target = resolve(base, path)
  const child = relative(base, target)
  if (!child || child === '..' || child.startsWith('..' + sep) || isAbsolute(child))
    throw new Error('路徑超出允許根：' + target)
  let current = base
  if (lstatSync(base).isSymbolicLink()) throw new Error('根不可為符號連結：' + base)
  for (const part of child.split(sep)) {
    current = join(current, part)
    // lstat 可辨識 dangling symlink；缺失路徑由集合讀取器分類。
    try {
      if (lstatSync(current).isSymbolicLink()) throw new Error('拒絕符號連結：' + current)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
  return target
}

export function readInputTree(root: string, path: string, required = true): Map<string, string> {
  const target = assertSafeInputPath(root, path)
  const result = new Map<string, string>()
  if (!existsSync(target)) {
    if (required) throw new Error('輸入或產物缺失：' + target)
    return result
  }
  const visit = (file: string): void => {
    assertSafeInputPath(root, file)
    const stat = lstatSync(file)
    if (stat.isDirectory()) {
      result.set(relative(resolve(root), file).replace(/\\/g, '/') + '/', 'directory')
      for (const name of readdirSync(file).sort()) visit(join(file, name))
    } else if (stat.isFile()) {
      result.set(
        relative(resolve(root), file).replace(/\\/g, '/'),
        createHash('sha256').update(readFileSync(file)).digest('hex'),
      )
    } else throw new Error('不是普通檔案或目錄：' + file)
  }
  visit(target)
  return result
}
