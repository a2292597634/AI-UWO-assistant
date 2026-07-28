import { readdirSync, readFileSync } from 'node:fs'
import { extname, join, relative } from 'node:path'

export interface RuntimeNetworkReference {
  file: string
  line: number
  reason: 'remote URL' | 'wx.request' | 'wx.downloadFile' | 'wx.cloud'
}

const sourceExtensions = new Set(['.ts', '.json', '.wxml', '.wxss', '.wxs'])
const forbidden = [
  { pattern: /https?:\/\//, reason: 'remote URL' as const },
  { pattern: /\bwx\.request\s*\(/, reason: 'wx.request' as const },
  { pattern: /\bwx\.downloadFile\s*\(/, reason: 'wx.downloadFile' as const },
  { pattern: /\bwx\.cloud\b/, reason: 'wx.cloud' as const },
]

export const findRuntimeNetworkReferences = (root: string): RuntimeNetworkReference[] => {
  const results: RuntimeNetworkReference[] = []

  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) {
        visit(path)
        continue
      }
      if (!sourceExtensions.has(extname(path))) continue

      readFileSync(path, 'utf8')
        .split(/\r?\n/)
        .forEach((line, index) => {
          for (const rule of forbidden) {
            if (rule.pattern.test(line)) {
              results.push({
                file: relative(root, path).replace(/\\/g, '/'),
                line: index + 1,
                reason: rule.reason,
              })
            }
          }
        })
    }
  }

  visit(root)
  return results
}
