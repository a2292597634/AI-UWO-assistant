export interface CloudBasePublishConfigInput {
  envId?: string
  cdnOrigin?: string
  contentVersion?: string
  cloudPathPrefix?: string
  cacheControl?: string
  cliCommand?: string
}

export interface CloudBasePublishConfig {
  envId: string
  cdnOrigin: string
  contentVersion: string
  cloudPathPrefix: string
  cacheControl: string
  cliCommand: string
}

const VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
const PATH_PATTERN = /^[A-Za-z0-9][A-Za-z0-9/_-]*[A-Za-z0-9]$/
const CLOUDBASE_CDN_HOST = /^[A-Za-z0-9][A-Za-z0-9-]*\.tcb\.qcloud\.la$/i

const STAGING_ORIGIN = 'https://uwo-staging-d4guwh8hyd3932655.storage.tcloudbase.com'

export const isAllowedAssetOrigin = (origin: URL, prefix: string): boolean =>
  origin.protocol === 'https:' &&
  (CLOUDBASE_CDN_HOST.test(origin.hostname) ||
    (origin.origin === STAGING_ORIGIN && prefix === 'assets'))

export const assertCloudBaseCdnOrigin = (originInput: string, prefix = 'assets'): string => {
  let origin: URL
  try {
    origin = new URL(originInput)
  } catch {
    throw new Error(`CloudBase CDN origin is invalid: ${originInput}`)
  }
  if (!isAllowedAssetOrigin(origin, prefix)) {
    throw new Error(`CloudBase CDN origin must be an HTTPS CloudBase CDN host: ${originInput}`)
  }
  if (
    origin.username ||
    origin.password ||
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash
  ) {
    throw new Error('CloudBase CDN origin must not include a path, query or fragment')
  }
  return origin.origin
}

export const parseCloudBasePublishConfig = (
  input: CloudBasePublishConfigInput,
): CloudBasePublishConfig => {
  const envId = input.envId?.trim()
  if (!envId) throw new Error('CloudBase environment ID is required; do not guess it')

  const originInput = input.cdnOrigin?.trim()
  if (!originInput) throw new Error('CloudBase CDN origin is required')

  const contentVersion = input.contentVersion?.trim() ?? ''
  if (!VERSION_PATTERN.test(contentVersion)) {
    throw new Error(`contentVersion is invalid: ${contentVersion}`)
  }

  const cloudPathPrefix = (input.cloudPathPrefix?.trim() || 'assets').replace(/\/+$/, '')
  const cdnOrigin = assertCloudBaseCdnOrigin(originInput, cloudPathPrefix)
  if (!PATH_PATTERN.test(cloudPathPrefix) || cloudPathPrefix.includes('..')) {
    throw new Error(`CloudBase cloud path prefix is invalid: ${cloudPathPrefix}`)
  }

  const cacheControl = input.cacheControl?.trim() || 'public, max-age=31536000, immutable'
  const cliCommand = input.cliCommand?.trim() || 'tcb'

  return {
    envId,
    cdnOrigin,
    contentVersion,
    cloudPathPrefix,
    cacheControl,
    cliCommand,
  }
}
