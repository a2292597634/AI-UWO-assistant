// 僅保留有限的數字錯誤碼，禁止持久化平台原始錯誤文字。
function providerErrorCode(error) {
  const value = error?.errCode ?? error?.errcode ?? error?.code
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^-?\d{1,9}$/.test(value)))
    return null
  const code = Number(value)
  return Number.isSafeInteger(code) && Math.abs(code) <= 999999999 ? code : null
}
module.exports = { providerErrorCode }
