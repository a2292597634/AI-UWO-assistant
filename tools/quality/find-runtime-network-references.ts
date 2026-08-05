import { readdirSync, readFileSync } from 'node:fs'
import { extname, join, relative } from 'node:path'

export interface RuntimeNetworkReference {
  file: string
  line: number
  reason: 'remote URL' | 'wx.request' | 'wx.downloadFile' | 'wx.cloud'
}

export interface RuntimeNetworkScanOptions {
  generatedCdnOrigin?: string
  generatedAssetPathPrefix?: string
}

const sourceExtensions = new Set(['.ts', '.js', '.json', '.wxml', '.wxss', '.wxs'])
const forbidden = [
  { pattern: /https?:\/\//, reason: 'remote URL' as const },
  { pattern: /\bwx\.request\s*\(/, reason: 'wx.request' as const },
  { pattern: /\bwx\.downloadFile\s*\(/, reason: 'wx.downloadFile' as const },
  { pattern: /\bwx\.cloud\b/, reason: 'wx.cloud' as const },
]

export const findRuntimeNetworkReferences = (
  root: string,
  options: RuntimeNetworkScanOptions = {},
): RuntimeNetworkReference[] => {
  const results: RuntimeNetworkReference[] = []

  const generatedAssetFile = (path: string): boolean =>
    /[\\/]generated[\\/](?:catalog|skills|fleet-officers)\.js$/.test(path) ||
    /[\\/]subpkg-detail[\\/]details-\d+\.js$/.test(path)

  const generatedAssetLine = (path: string, line: string): boolean => {
    if (!options.generatedCdnOrigin || !generatedAssetFile(path)) return false
    if (!/portraitPath|"(?:ip|pp)"/.test(line)) return false
    const urls = [...line.matchAll(/https?:\/\/[^"'\s]+/g)].map(([url]) => url)
    if (urls.length === 0) return false
    return urls.every((value) => {
      try {
        const url = new URL(value)
        return (
          url.protocol === 'https:' &&
          url.origin === options.generatedCdnOrigin &&
          !url.search &&
          !url.hash &&
          url.pathname.startsWith(options.generatedAssetPathPrefix ?? '/assets/')
        )
      } catch {
        return false
      }
    })
  }

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
            if (rule.reason === 'remote URL' && generatedAssetLine(path, line)) continue
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
