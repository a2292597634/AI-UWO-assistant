export type ReviewWaitCondition =
  | { kind: 'exists'; selector: string; exists: boolean }
  | { kind: 'text'; selector: string; equals: string }
  | { kind: 'text'; selector: string; contains: string }
  | { kind: 'page'; path: string }
export class WaitConditionTimeoutError extends Error {}
/** 單次 probe 也受剩餘期限限制；協議錯誤原樣向上傳遞。 */
export async function waitForCondition(input: {
  probe: () => Promise<boolean>
  timeoutMs: number
  pollMs: number
  stableSamples: number
  nowMs?: () => number
  sleep?: (durationMs: number) => Promise<void>
  description?: string
  lastObservation?: () => unknown
}): Promise<void> {
  if (
    !Number.isInteger(input.timeoutMs) ||
    input.timeoutMs < 1 ||
    input.timeoutMs > 30000 ||
    !Number.isInteger(input.pollMs) ||
    input.pollMs < 1 ||
    !Number.isInteger(input.stableSamples) ||
    input.stableSamples < 1
  )
    throw new Error('等待參數必須為正整數，timeoutMs 不超過 30000。')
  const now = input.nowMs ?? (() => Date.now()),
    sleep = input.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
  const started = now(),
    deadline = started + input.timeoutMs
  let stable = 0,
    last: boolean | undefined
  const timeout = (pendingProbe = false) =>
    new WaitConditionTimeoutError(
      (pendingProbe ? 'automator response timeout（條件探測尚未回覆）：' : '條件等待超時：') +
        (input.description ?? 'probe') +
        '；總等待 ' +
        input.timeoutMs +
        'ms；最後可觀察值：' +
        JSON.stringify(input.lastObservation?.() ?? last ?? '未知'),
    )
  while (now() < deadline) {
    const remaining = deadline - now()
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      last = await Promise.race([
        Promise.resolve().then(input.probe),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(timeout(true)), remaining)
        }),
      ])
    } finally {
      if (timer) clearTimeout(timer)
    }
    if (now() >= deadline) throw timeout()
    stable = last ? stable + 1 : 0
    if (stable >= input.stableSamples) return
    await sleep(Math.min(input.pollMs, Math.max(0, deadline - now())))
  }
  throw timeout()
}
