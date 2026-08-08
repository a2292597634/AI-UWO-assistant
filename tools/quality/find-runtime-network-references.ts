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
  /** Relative file paths (from miniprogram root) allowed to call wx.cloud.callFunction */
  allowedCloudFunctionFiles?: readonly string[]
  /** Relative file paths (from miniprogram root) allowed to call wx.cloud.init */
  allowedCloudInitFiles?: readonly string[]
}

const sourceExtensions = new Set(['.ts', '.js', '.json', '.wxml', '.wxss', '.wxs'])
const forbidden = [
  { pattern: /https?:\/\//, reason: 'remote URL' as const },
  { pattern: /\bwx\.request\s*\(/, reason: 'wx.request' as const },
  { pattern: /\bwx\.downloadFile\s*\(/, reason: 'wx.downloadFile' as const },
  { pattern: /\bwx\.cloud\b/, reason: 'wx.cloud' as const },
]

const cloudReferencePattern = /\bwx\.cloud\b/g
const cloudCallPattern = /^wx\.cloud\.([A-Za-z_$][\w$]*)\s*\(/u
const cloudAvailabilityGuardPattern = /^\s*if\s*\(\s*wx\.cloud\s*\)\s*\{?\s*$/u

const stripCloudComments = (line: string, state: { inBlockComment: boolean }): string => {
  let code = line
  while (true) {
    if (state.inBlockComment) {
      const end = code.indexOf('*/')
      if (end === -1) return ''
      state.inBlockComment = false
      code = code.slice(end + 2)
      continue
    }

    if (code.trimStart().startsWith('//')) return ''
    const start = code.indexOf('/*')
    if (start === -1) return code

    const end = code.indexOf('*/', start + 2)
    if (end === -1) {
      state.inBlockComment = true
      return code.slice(0, start)
    }
    code = code.slice(0, start) + code.slice(end + 2)
  }
}

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

      const relativePath = relative(root, path).replace(/\\/g, '/')

      const commentState = { inBlockComment: false }
      readFileSync(path, 'utf8')
        .split(/\r?\n/)
        .forEach((line, index) => {
          const cloudScanLine = stripCloudComments(line, commentState)
          for (const rule of forbidden) {
            if (rule.reason === 'remote URL' && generatedAssetLine(path, line)) continue

            if (rule.reason === 'wx.cloud') {
              const cloudReferences = [...cloudScanLine.matchAll(cloudReferencePattern)]
              const hasForbiddenCloudReference = cloudReferences.some((match) => {
                const api = cloudScanLine.slice(match.index).match(cloudCallPattern)?.[1]
                return !(
                  (api === undefined &&
                    cloudAvailabilityGuardPattern.test(cloudScanLine) &&
                    options.allowedCloudInitFiles?.includes(relativePath)) ||
                  (api === 'init' && options.allowedCloudInitFiles?.includes(relativePath)) ||
                  (api === 'callFunction' &&
                    options.allowedCloudFunctionFiles?.includes(relativePath))
                )
              })

              if (!hasForbiddenCloudReference) continue
            }

            if (rule.pattern.test(line)) {
              results.push({
                file: relativePath,
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
