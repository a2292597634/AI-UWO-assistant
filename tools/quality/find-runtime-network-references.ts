import { readdirSync, readFileSync } from 'node:fs'
import { extname, join, relative } from 'node:path'
import ts from 'typescript'

export interface RuntimeNetworkReference {
  file: string
  line: number
  reason: 'remote URL' | 'wx.request' | 'wx.downloadFile' | 'wx.cloud'
}

export interface RuntimeNetworkScanOptions {
  generatedCdnOrigin?: string
  generatedAssetPathPrefix?: string
  /** 相對於 miniprogram 根目錄，只允許精確 callFunction 呼叫。 */
  allowedCloudFunctionFiles?: readonly string[]
  /** 相對於 miniprogram 根目錄，只允許精確 uploadFile 呼叫。 */
  allowedCloudUploadFiles?: readonly string[]
  /** 相對於 miniprogram 根目錄，只允許 init 呼叫與可用性判斷。 */
  allowedCloudInitFiles?: readonly string[]
  /** 僅允許此精確檔案直接 new wx.cloud.Cloud，不允許提取建構器。 */
  allowedSharedCloudConstructorFile?: string
}

const sourceExtensions = new Set(['.ts', '.js', '.json', '.wxml', '.wxss', '.wxs'])
const scriptExtensions = new Set(['.ts', '.js', '.wxs'])
const imageFields = new Set(['portraitPath', 'ip', 'pp', 'iconPath'])

const generatedAssetFile = (path: string): boolean =>
  /^generated\/(?:catalog|skills|fleet-officers)\.js$/.test(path) ||
  /^subpkg-fleet\/generated\/fleet-officers\.js$/.test(path) ||
  /^subpkg-detail\/details-\d+\.js$/.test(path) ||
  /^subpkg-trade\/trade-(?:goods|details-\d+)\.js$/.test(path)

const accessName = (node: ts.Node): string | undefined => {
  if (ts.isPropertyAccessExpression(node)) return node.name.text
  if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression)) {
    return node.argumentExpression.text
  }
  return undefined
}

const isAccess = (
  node: ts.Node,
): node is ts.PropertyAccessExpression | ts.ElementAccessExpression =>
  ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)

/** 建構結果必須直接落在可追蹤變數，不能先鏈式取資料庫或解構。 */
const sharedBindingName = (node: ts.NewExpression): string | undefined => {
  let value: ts.Node = node
  while (value.parent) {
    const parent = value.parent
    if (
      ts.isParenthesizedExpression(parent) ||
      (ts.isConditionalExpression(parent) &&
        (parent.whenTrue === value || parent.whenFalse === value))
    ) {
      value = parent
    } else break
  }
  const declaration = value.parent
  return declaration &&
    ts.isVariableDeclaration(declaration) &&
    declaration.initializer === value &&
    ts.isIdentifier(declaration.name)
    ? declaration.name.text
    : undefined
}

const allowedAssetUrl = (value: string, options: RuntimeNetworkScanOptions): boolean => {
  if (!options.generatedCdnOrigin || !/^https:\/\/[^\s]+$/.test(value)) return false
  try {
    const url = new URL(value)
    return (
      url.origin === options.generatedCdnOrigin &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      url.pathname.startsWith(options.generatedAssetPathPrefix ?? '/assets/')
    )
  } catch {
    return false
  }
}

export const findRuntimeNetworkReferences = (
  root: string,
  options: RuntimeNetworkScanOptions = {},
): RuntimeNetworkReference[] => {
  const results: RuntimeNetworkReference[] = []
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) {
        visit(path)
        continue
      }
      if (!sourceExtensions.has(extname(path))) continue
      const file = relative(root, path).replace(/\\/g, '/')
      const text = readFileSync(path, 'utf8')
      const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true)
      const findings = new Map<string, RuntimeNetworkReference>()
      const add = (position: number, reason: RuntimeNetworkReference['reason']): void => {
        const line = source.getLineAndCharacterOfPosition(position).line + 1
        findings.set(`${line}:${reason}`, { file, line, reason })
      }
      const allowedUrlSpans: Array<{ start: number; end: number }> = []

      if (scriptExtensions.has(extname(path))) {
        const sharedBindings = new Set<string>()
        const collectSharedBindings = (node: ts.Node): void => {
          if (file === options.allowedSharedCloudConstructorFile && ts.isNewExpression(node)) {
            const constructor = node.expression
            if (
              isAccess(constructor) &&
              accessName(constructor) === 'Cloud' &&
              isAccess(constructor.expression) &&
              accessName(constructor.expression) === 'cloud' &&
              ts.isIdentifier(constructor.expression.expression) &&
              constructor.expression.expression.text === 'wx'
            ) {
              const binding = sharedBindingName(node)
              if (binding) sharedBindings.add(binding)
            }
          }
          ts.forEachChild(node, collectSharedBindings)
        }
        if (file === options.allowedSharedCloudConstructorFile) collectSharedBindings(source)
        const scan = (node: ts.Node): void => {
          if (sharedBindings.size > 0 && ts.isIdentifier(node) && sharedBindings.has(node.text)) {
            const parent = node.parent
            const binding = ts.isVariableDeclaration(parent) && parent.name === node
            const guard = ts.isIfStatement(parent) && parent.expression === node
            const directCall =
              isAccess(parent) &&
              parent.expression === node &&
              ['init', 'callFunction', 'uploadFile'].includes(accessName(parent) ?? '') &&
              ts.isCallExpression(parent.parent) &&
              parent.parent.expression === parent
            if (!binding && !guard && !directCall) add(node.getStart(source), 'wx.cloud')
          }
          if (ts.isStringLiteralLike(node)) {
            const property = node.parent
            const field = ts.isPropertyAssignment(property)
              ? ts.isIdentifier(property.name) || ts.isStringLiteralLike(property.name)
                ? property.name.text
                : undefined
              : undefined
            const allowed =
              generatedAssetFile(file) &&
              ts.isPropertyAssignment(property) &&
              property.initializer === node &&
              field !== undefined &&
              imageFields.has(field) &&
              allowedAssetUrl(node.text, options)
            if (allowed) allowedUrlSpans.push({ start: node.getStart(source), end: node.end })
            // 解析後的字串也要掃描，避免 Unicode 跳脫將 URL 藏於原文之外。
            if (/https?:\/\//.test(node.text) && !allowed) add(node.getStart(source), 'remote URL')
          }

          // 動態模板的固定片段同樣使用解析值，且不能取得完整靜態圖片的豁免。
          if (
            (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) &&
            /https?:\/\//.test(node.text)
          ) {
            add(node.getStart(source), 'remote URL')
          }

          if (isAccess(node) && ts.isIdentifier(node.expression) && node.expression.text === 'wx') {
            const name = accessName(node)
            if (name === 'request' || name === 'downloadFile')
              add(node.getStart(source), `wx.${name}`)
            if (name === 'cloud') {
              const api = node.parent
              const call = api.parent
              const apiName = isAccess(api) && api.expression === node ? accessName(api) : undefined
              const allowedCall =
                ts.isCallExpression(call) &&
                call.expression === api &&
                ((apiName === 'init' && options.allowedCloudInitFiles?.includes(file)) ||
                  (apiName === 'callFunction' &&
                    options.allowedCloudFunctionFiles?.includes(file)) ||
                  (apiName === 'uploadFile' && options.allowedCloudUploadFiles?.includes(file)))
              const allowedGuard =
                ts.isIfStatement(api) &&
                api.expression === node &&
                options.allowedCloudInitFiles?.includes(file)
              const allowedConstructor =
                file === options.allowedSharedCloudConstructorFile &&
                apiName === 'Cloud' &&
                ts.isNewExpression(call) &&
                call.expression === api &&
                sharedBindingName(call) !== undefined
              if (!allowedCall && !allowedGuard && !allowedConstructor) {
                add(node.getStart(source), 'wx.cloud')
              }
            }
          }
          ts.forEachChild(node, scan)
        }
        scan(source)
      } else {
        // WXML、WXSS、JSON 不是普通 JS，保留文字掃描，不能因 AST 無節點而漏過。
        for (const match of text.matchAll(
          /\bwx\s*(?:\.\s*(request|downloadFile|cloud)|\[\s*["'](request|downloadFile|cloud)["']\s*\])/g,
        )) {
          add(match.index, `wx.${match[1] ?? match[2]}` as RuntimeNetworkReference['reason'])
        }
      }
      for (const match of text.matchAll(/https?:\/\//g)) {
        if (!allowedUrlSpans.some((span) => match.index >= span.start && match.index < span.end)) {
          add(match.index, 'remote URL')
        }
      }
      results.push(
        ...[...findings.values()].sort(
          (a, b) => a.line - b.line || a.reason.localeCompare(b.reason),
        ),
      )
    }
  }
  visit(root)
  return results
}
