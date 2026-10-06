/** 依文檔產生單批次規則候選；須先通過實際平台驗證，不覆寫未知規則。 */
export function buildPrivateProbeRule(
  current: { acl: string; rule?: unknown },
  runId: string,
): { acl: 'CUSTOM'; rule: { read: string; write: 'false' }; privatePrefix: string } {
  if (current.acl !== 'ADMINWRITE' || current.rule != null)
    throw new Error('PROBE_STORAGE_BASELINE_UNSUPPORTED')
  if (!/^g0-shared-[a-z0-9_-]{1,50}$/.test(runId)) throw new Error('PROBE_STORAGE_RUN_INVALID')
  const privatePrefix = 'message-board-probes/private/' + runId + '/'
  return {
    acl: 'CUSTOM',
    rule: {
      read: '/^' + privatePrefix.replace(/\//g, '\\/') + '/.test(resource.path) == false',
      write: 'false',
    },
    privatePrefix,
  }
}
