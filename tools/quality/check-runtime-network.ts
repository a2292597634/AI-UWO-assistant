import { findRuntimeNetworkReferences } from './find-runtime-network-references'

const findings = findRuntimeNetworkReferences('miniprogram')

if (findings.length > 0) {
  for (const finding of findings) {
    console.error(`${finding.file}:${finding.line} ${finding.reason}`)
  }
  process.exitCode = 1
} else {
  console.log('Runtime network boundary: PASS')
}
