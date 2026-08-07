import { existsSync, readFileSync } from 'node:fs'
import { findRuntimeNetworkReferences } from './find-runtime-network-references'

const manifestPath =
  process.env.CLOUDBASE_ASSET_MANIFEST_PATH ?? 'data/assets/cloudbase-manifest.json'
let generatedCdnOrigin: string | undefined
let generatedAssetPathPrefix: string | undefined
if (existsSync(manifestPath)) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    cdnOrigin?: string
    cloudPathPrefix?: string
  }
  generatedCdnOrigin = manifest.cdnOrigin
  generatedAssetPathPrefix = manifest.cloudPathPrefix ? `/${manifest.cloudPathPrefix}/` : undefined
}

const findings = findRuntimeNetworkReferences('miniprogram', {
  generatedCdnOrigin,
  generatedAssetPathPrefix,
  allowedCloudFunctionFiles: ['runtime/fleet-config-service.ts'],
  allowedCloudInitFiles: ['app.ts'],
})

if (findings.length > 0) {
  for (const finding of findings) {
    console.error(`${finding.file}:${finding.line} ${finding.reason}`)
  }
  process.exitCode = 1
} else {
  console.log('Runtime network boundary: PASS')
}
