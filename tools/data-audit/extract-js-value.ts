const locateValueStart = (source: string, key: string): number => {
  const marker = `${JSON.stringify(key)}:`
  const markerIndex = source.indexOf(marker)
  if (markerIndex < 0) throw new Error(`AUDIT_SOURCE_KEY_MISSING:${key}`)
  let index = markerIndex + marker.length
  while (/\s/.test(source[index] ?? '')) index += 1
  return index
}

export const extractJsValue = <T>(source: string, key: string): T => {
  const start = locateValueStart(source, key)
  const opening = source[start]
  if (opening !== '{' && opening !== '[') {
    throw new Error(`AUDIT_SOURCE_VALUE_NOT_STRUCTURED:${key}`)
  }

  const closing = opening === '{' ? '}' : ']'
  let depth = 0
  let inString = false
  let escaped = false

  for (let index = start; index < source.length; index += 1) {
    const char = source[index]
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') inString = true
    else if (char === opening) depth += 1
    else if (char === closing) {
      depth -= 1
      if (depth === 0) return JSON.parse(source.slice(start, index + 1)) as T
    }
  }

  throw new Error(`AUDIT_SOURCE_VALUE_TRUNCATED:${key}`)
}

export const extractJsString = (source: string, key: string): string => {
  const start = locateValueStart(source, key)
  if (source[start] !== '"') throw new Error(`AUDIT_SOURCE_VALUE_NOT_STRING:${key}`)

  let escaped = false
  for (let index = start + 1; index < source.length; index += 1) {
    const char = source[index]
    if (escaped) escaped = false
    else if (char === '\\') escaped = true
    else if (char === '"') return JSON.parse(source.slice(start, index + 1)) as string
  }

  throw new Error(`AUDIT_SOURCE_VALUE_TRUNCATED:${key}`)
}
