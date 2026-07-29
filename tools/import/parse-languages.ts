import { extractJsString } from '../data-audit/extract-js-value'

/**
 * Extract the value of a JavaScript variable assignment like `var x={...}` or `x={...}`.
 * Supports bracketed names like `lang_js[1]={...}`.
 */
export const extractJsAssignment = <T>(source: string, varName: string): T => {
  // Find the variable name followed by =
  const marker = `${varName}=`
  const markerIndex = source.indexOf(marker)
  if (markerIndex < 0) {
    throw new Error(`IMPORT_VARIABLE_MISSING:${varName}`)
  }

  let pos = markerIndex + marker.length
  // Skip whitespace
  while (/\s/.test(source[pos] ?? '')) pos += 1

  const startIndex = pos
  const opening = source[startIndex]
  if (opening !== '{' && opening !== '[') {
    throw new Error(`IMPORT_VARIABLE_NOT_STRUCTURED:${varName}`)
  }

  const closing = opening === '{' ? '}' : ']'
  let depth = 0
  let inString = false
  let escaped = false

  for (; pos < source.length; pos += 1) {
    const ch = source[pos]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === opening) depth += 1
    else if (ch === closing) {
      depth -= 1
      if (depth === 0) {
        return JSON.parse(source.slice(startIndex, pos + 1)) as T
      }
    }
  }

  throw new Error(`IMPORT_VARIABLE_TRUNCATED:${varName}`)
}

/**
 * Parse the display name dictionary from one or more lang_1.js range files.
 *
 * Strategy:
 * 1. Concatenate all range files and try to extract the full `lang_js[1]` object.
 * 2. If the full extraction fails (e.g., due to a gap between ranges), fall back
 *    to per-key extraction using `extractJsString` on each range individually.
 *
 * Key types we need from lang_js[1]:
 * - skill<N>        → skill display name
 * - skill<N>des     → skill description
 * - job_<jobId>     → job display name
 * - lang<N>         → language display name
 * - town<N>         → city display name
 * - menuskt<N>      → skill category display name
 * - ctn_<id>        → nationality display name
 * - chasT<N>        → officer display name (fallback when cht is missing)
 */
export const parseLanguageMap = (
  rangeFiles: string[],
): Record<string, string> => {
  // Strategy 1: Try concatenation + full extraction
  const concatenated = rangeFiles.join('')
  try {
    return extractJsAssignment<Record<string, string>>(concatenated, 'lang_js[1]')
  } catch {
    // Strategy 2: Per-key extraction from each range
    const result: Record<string, string> = {}
    const seenKeys = new Set<string>()

    // Scan each range for string keys that look like identifiers
    const keyPattern = /"([a-zA-Z_][a-zA-Z0-9_]*)":/g

    for (const rangeSource of rangeFiles) {
      // Reset regex state
      keyPattern.lastIndex = 0
      const keys = new Set<string>()
      let match: RegExpExecArray | null
      while ((match = keyPattern.exec(rangeSource)) !== null) {
        const key = match[1]!
        // Filter out things that aren't data keys (e.g., standard object property names)
        if (key === 'constructor' || key === '__proto__') continue
        keys.add(key)
      }

      // For each key found, try to extract its value using extractJsString
      for (const key of keys) {
        if (seenKeys.has(key)) continue
        try {
          const value = extractJsString(rangeSource, key)
          result[key] = value
          seenKeys.add(key)
        } catch {
          // Key may span a range boundary — skip and try in another range
        }
      }
    }

    return result
  }
}
