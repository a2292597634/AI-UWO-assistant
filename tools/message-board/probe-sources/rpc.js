/* global module, require */
/* eslint-disable @typescript-eslint/no-require-imports */
const {
  collections,
  checkedContext,
  checkedActor,
  metadata,
  optionalDoc,
  imageBytes,
  checkedApi,
  safeCode,
  sha256,
  docId,
  randomUUID,
} = require('./shared')
const privateAvatar = require('./private-avatar')

function createProbe(cloud, config) {
  return async (event) => {
    let current
    let textRequestStarted = false
    try {
      current = checkedContext(cloud, config, event?.action)
      const actorHash = checkedActor(current, config, event?.action !== 'getIdentity')
      const success = (data) => ({
        ok: true,
        data: metadata(config, current, { actorHash, ...data }),
      })
      if (event?.action === 'getIdentity') return success({})
      if (config.sharedEnvironmentAuthorization?.scope === 'private-avatar-callback') {
        return success(await privateAvatar.invoke(cloud, config, current, actorHash, event))
      }
      if (event?.action === 'echoImage') {
        const image = imageBytes(event.base64)
        return success({
          base64: image.bytes.toString('base64'),
          sha256: sha256(image.bytes),
          byteSize: image.bytes.length,
          width: image.width,
          height: image.height,
        })
      }
      if (event?.action === 'checkText') {
        textRequestStarted = true
        const response = await cloud.openapi.security.msgSecCheck({
          openid: current.OPENID,
          version: 2,
          scene: 2,
          content: '留言板合成測試文字',
        })
        const traceId = checkedApi(response)
        if (!['pass', 'review', 'risky'].includes(response.result?.suggest))
          throw { code: 'provider-response-invalid' }
        return success({ traceId, suggest: response.result.suggest })
      }
      if (event?.action === 'stageAvatar') {
        const image = imageBytes(event.base64)
        const assetId = randomUUID()
        const uploaded = await cloud.uploadFile({
          cloudPath:
            'message-board-probes/private/' + config.runId + '/' + assetId + '.' + image.extension,
          fileContent: image.bytes,
        })
        if (typeof uploaded?.fileID !== 'string' || !uploaded.fileID)
          throw { code: 'provider-response-invalid' }
        const db = cloud.database()
        await db
          .collection(collections.assets)
          .doc(assetId)
          .set({
            data: {
              runId: config.runId,
              candidateSha: config.candidateSha,
              ownerHash: actorHash,
              privateFileId: uploaded.fileID,
              publicFileId: null,
              sha256: sha256(image.bytes),
              extension: image.extension,
              byteSize: image.bytes.length,
              width: image.width,
              height: image.height,
            },
          })
        return success({ assetId, sha256: sha256(image.bytes), byteSize: image.bytes.length })
      }
      if (
        ['previewAvatar', 'submitImage', 'makePublicAvatar', 'removeAsset'].includes(event?.action)
      ) {
        if (typeof event.assetId !== 'string' || !/^[a-f0-9-]{36}$/.test(event.assetId))
          throw { code: 'not-found' }
        const db = cloud.database()
        const asset = await optionalDoc(db, collections.assets, event.assetId)
        if (
          !asset ||
          asset.ownerHash !== actorHash ||
          asset.runId !== config.runId ||
          asset.candidateSha !== config.candidateSha
        )
          throw { code: 'not-found' }
        if (event.action === 'removeAsset') {
          const ids = [asset.privateFileId, asset.publicFileId].filter(Boolean)
          const removed = await cloud.deleteFile({ fileList: ids })
          if (
            !Array.isArray(removed?.fileList) ||
            removed.fileList.some((file) => file.status !== 0)
          )
            throw { code: 'provider-error' }
          await db.collection(collections.assets).doc(event.assetId).remove()
          return success({ assetId: event.assetId, removed: true })
        }
        if (event.action === 'submitImage') {
          const temp = await cloud.getTempFileURL({
            fileList: [{ fileID: asset.privateFileId, maxAge: 3600 }],
          })
          const link = temp?.fileList?.[0]
          if (
            link?.status !== 0 ||
            typeof link.tempFileURL !== 'string' ||
            !link.tempFileURL.startsWith('https://')
          )
            throw { code: 'provider-response-invalid' }
          const response = await cloud.openapi.security.mediaCheckAsync({
            openid: current.OPENID,
            version: 2,
            scene: 1,
            mediaType: 2,
            mediaUrl: link.tempFileURL,
          })
          const traceId = checkedApi(response)
          await db
            .collection(collections.traces)
            .doc(docId(config, traceId))
            .set({
              data: {
                runId: config.runId,
                candidateSha: config.candidateSha,
                assetId: event.assetId,
                traceId,
              },
            })
          await db.collection(collections.assets).doc(event.assetId).update({ data: { traceId } })
          return success({ assetId: event.assetId, traceId })
        }
        if (event.action === 'makePublicAvatar') {
          const verified = asset.traceId
            ? await optionalDoc(db, collections.results, docId(config, asset.traceId))
            : null
          if (
            !verified ||
            verified.runId !== config.runId ||
            verified.candidateSha !== config.candidateSha ||
            verified.assetId !== event.assetId ||
            verified.traceId !== asset.traceId ||
            verified.errCode !== 0 ||
            verified.suggest !== 'pass'
          )
            throw { code: 'safety-not-ready' }
        }
        const downloaded = await cloud.downloadFile({ fileID: asset.privateFileId })
        if (sha256(downloaded.fileContent) !== asset.sha256)
          throw { code: 'provider-response-invalid' }
        if (event.action === 'previewAvatar')
          return success({
            assetId: event.assetId,
            base64: downloaded.fileContent.toString('base64'),
            sha256: asset.sha256,
          })
        const published = await cloud.uploadFile({
          cloudPath:
            'message-board-probes/public/' +
            config.runId +
            '/' +
            randomUUID() +
            '.' +
            asset.extension,
          fileContent: downloaded.fileContent,
        })
        if (typeof published?.fileID !== 'string' || !published.fileID)
          throw { code: 'provider-response-invalid' }
        await db
          .collection(collections.assets)
          .doc(event.assetId)
          .update({ data: { publicFileId: published.fileID } })
        return success({
          assetId: event.assetId,
          publicFileId: published.fileID,
          sha256: asset.sha256,
        })
      }
      throw { code: 'unknown-action' }
    } catch (error) {
      const code = safeCode(error)
      if (textRequestStarted && config?.sharedEnvironmentAuthorization) {
        const errCode = Number(error?.errCode)
        return {
          ok: false,
          code,
          diagnostic: {
            api: 'security.msgSecCheck',
            errCode: Number.isSafeInteger(errCode) ? errCode : null,
            errorType: ['Error', 'TypeError', 'ReferenceError'].includes(error?.name)
              ? error.name
              : 'SDKError',
            permissionHint: /permission|unauthori[sz]ed|权限|權限|未授权|未授權/i.test(
              error?.errMsg || error?.message || '',
            ),
          },
        }
      }
      // 只在已固化共享授權的唯讀診斷中觀察來源；不回傳完整上下文或 OpenID。
      if (
        code === 'source-forbidden' &&
        event?.action === 'getIdentity' &&
        config?.sharedEnvironmentAuthorization &&
        current
      ) {
        return {
          ok: false,
          code,
          diagnostic: {
            source: typeof current.SOURCE === 'string' ? current.SOURCE.slice(0, 80) : null,
            appId: typeof current.APPID === 'string' ? current.APPID.slice(0, 32) : null,
            hasOpenId: typeof current.OPENID === 'string' && Boolean(current.OPENID),
            hasFromAppId: Boolean(current.FROM_APPID),
          },
        }
      }
      return { ok: false, code }
    }
  }
}
module.exports = { createProbe }
