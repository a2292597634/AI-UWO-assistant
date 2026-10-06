/** CLI 有時在 JSON 前印資訊行；缺少／損壞的唯讀結果不能被當成成功。 */
export function parseCloudbaseOutput(output: string, allowNoJson = false): unknown {
  const start = output.search(/^\s*\{/m)
  if (start < 0) {
    if (allowNoJson) return null
    throw new Error('CLI_JSON_MISSING')
  }
  const value = JSON.parse(output.slice(start)) as { data?: unknown; error?: unknown }
  if (!value || typeof value !== 'object' || value.error || !('data' in value))
    throw new Error('CLI_RESULT_INVALID')
  const data = value.data
  if (data && typeof data === 'object' && 'Error' in data) throw new Error('CLI_API_ERROR')
  return data
}

/** QUERY 與原生 COMMAND/find 的結果格式不同；空陣列只是不存在，不是格式錯誤。 */
export function readNoSqlRows(value: unknown): Record<string, unknown>[] {
  const invalid = () => {
    throw new Error('CLI_QUERY_RESULT_INVALID')
  }
  if (
    !value ||
    typeof value !== 'object' ||
    !('results' in value) ||
    !Array.isArray(value.results) ||
    value.results.length !== 1 ||
    !Array.isArray(value.results[0])
  )
    return invalid()
  const group = value.results[0] as unknown[]
  let rows = group
  const first = group[0]
  if (group.length === 1 && first && typeof first === 'object' && 'cursor' in first) {
    const cursor = first.cursor
    if (
      !cursor ||
      typeof cursor !== 'object' ||
      !('firstBatch' in cursor) ||
      !Array.isArray(cursor.firstBatch)
    )
      return invalid()
    rows = cursor.firstBatch
  }
  if (!rows.every((row) => row && typeof row === 'object' && !Array.isArray(row))) return invalid()
  return rows as Record<string, unknown>[]
}
