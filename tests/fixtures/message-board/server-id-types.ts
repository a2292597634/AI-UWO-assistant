import catalog from '../../../miniprogram/generated/game-servers'
const valid: (typeof catalog.servers)[number]['id'] = 'UWOGL-US-01'
// @ts-expect-error 未登記伺服器不能被靜默接受為 string。
const invalid: (typeof catalog.servers)[number]['id'] = 'forged'
void valid
void invalid
