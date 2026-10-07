export interface GameServerCatalog {
  version: string
  servers: readonly { id: string; name: string }[]
}

/** 伺服器由 master 產生，所有消費端保留相同順序與 literal ID。 */
export function buildGameServerOutputs(input: unknown): {
  runtimeJs: string
  runtimeTypes: string
  referenceJson: string
} {
  const record = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value)
  const invalid: () => never = () => {
    throw new Error('SERVER_CATALOG_INVALID')
  }
  if (
    !record(input) ||
    Object.keys(input).some((key) => !['version', 'servers'].includes(key)) ||
    typeof input.version !== 'string' ||
    !/^[a-zA-Z0-9.-]{1,32}$/.test(input.version) ||
    !Array.isArray(input.servers) ||
    input.servers.length === 0 ||
    input.servers.length > 100
  )
    invalid()
  const ids = new Set<string>()
  const servers = input.servers.map((server: unknown) => {
    if (
      !record(server) ||
      Object.keys(server).some((key) => !['id', 'name'].includes(key)) ||
      typeof server.id !== 'string' ||
      !/^[A-Z0-9-]{1,40}$/.test(server.id) ||
      typeof server.name !== 'string' ||
      server.name !== server.name.trim() ||
      !server.name ||
      Array.from(server.name).length > 64
    )
      invalid()
    if (ids.has(server.id)) throw new Error('SERVER_ID_DUPLICATED')
    ids.add(server.id)
    return { id: server.id, name: server.name }
  })
  const catalog = { version: input.version, servers }
  const referenceJson = JSON.stringify(catalog, null, 2) + '\n'
  return {
    referenceJson,
    runtimeJs: '// 工具生成，禁止手動修改。\nmodule.exports = ' + referenceJson.trimEnd() + '\n',
    runtimeTypes:
      '// 工具生成，禁止手動修改。\ndeclare const catalog: { readonly version: ' +
      JSON.stringify(catalog.version) +
      '; readonly servers: readonly [\n' +
      servers
        .map(
          (server) =>
            '  { readonly id: ' +
            JSON.stringify(server.id) +
            '; readonly name: ' +
            JSON.stringify(server.name) +
            ' }',
        )
        .join(',\n') +
      '\n] };\nexport = catalog\n',
  }
}
