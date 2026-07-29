import { describe, expect, it } from 'vitest'
import { renderAuditDocs } from '../../tools/data-audit/render-audit-docs'

describe('audit reports', () => {
  it('sorts findings independently of input order', () => {
    const baseFindings = [
      {
        severity: 'warning',
        code: 'Z',
        entityType: 'test',
        entityId: '2',
        path: '/b',
        observedValue: null,
        message: 'z',
        suggestedAction: 'review',
      },
      {
        severity: 'error',
        code: 'A',
        entityType: 'test',
        entityId: '1',
        path: '/a',
        observedValue: null,
        message: 'a',
        suggestedAction: 'fix',
      },
    ] as const
    const input = { fields: [], enums: [], mappings: [], assets: [], findings: [...baseFindings] }
    const reversed = { ...input, findings: [...baseFindings].reverse() }
    expect(renderAuditDocs(input as Parameters<typeof renderAuditDocs>[0])).toEqual(
      renderAuditDocs(reversed as Parameters<typeof renderAuditDocs>[0]),
    )
  })

  it('contains no placeholder keywords', () => {
    const output = Object.values(
      renderAuditDocs({
        fields: [],
        enums: [],
        mappings: [],
        assets: [],
        findings: [],
      }),
    ).join('\n')
    expect(output).not.toMatch(/\b(?:TBD|TODO|FIXME)\b/i)
  })

  it('contains no alias field headings', () => {
    const output = Object.values(
      renderAuditDocs({
        fields: [],
        enums: [],
        mappings: [],
        assets: [],
        findings: [],
      }),
    ).join('\n')
    expect(output).not.toMatch(/^\|\s*(?:alias|aliases)\s*\|/im)
  })
})
