import type { ReviewAdapter } from './adapter'

export const REVIEW_FIXTURE_NAMES = [
  'error-report-review',
  'error-report-mine',
  'coupon-success',
  'coupon-known-failure',
  'coupon-unknown',
] as const
export type ReviewFixtureName = (typeof REVIEW_FIXTURE_NAMES)[number]
export interface ReviewFixtureSession {
  restore(): Promise<void>
}
export const parseReviewFixtureName = (value: string): ReviewFixtureName => {
  if (!REVIEW_FIXTURE_NAMES.includes(value as ReviewFixtureName))
    throw new Error(`不支持的離線 fixture：${value}`)
  return value as ReviewFixtureName
}

export const installReviewFixture = async (
  adapter: ReviewAdapter,
  name: ReviewFixtureName,
): Promise<ReviewFixtureSession> => {
  parseReviewFixtureName(name)
  if (!adapter.installFixture || !adapter.restoreFixture)
    throw new Error('驗收適配器不支持安全 fixture，禁止開啟目標頁')
  try {
    await adapter.installFixture(name)
  } catch (error) {
    await adapter.restoreFixture()
    throw error
  }
  return { restore: () => adapter.restoreFixture!() }
}

// 僅固定工具源碼可送入 evaluate；場景不得提供腳本或檔案路徑。
export const fixtureInstallSource = (name: ReviewFixtureName): string => {
  parseReviewFixtureName(name)
  return `function () {
    var name = '${name}';
    if (!wx.cloud || typeof wx.cloud.callFunction !== 'function') throw new Error('缺少可替代的 cloud API');
    if (wx.__uwoReviewFixture) throw new Error('前次 fixture 尚未恢復');
    var saved = [], wrappers = [];
    var marker = { name: name, saved: saved, wrappers: wrappers };
    wx.__uwoReviewFixture = marker;
    if (wx.__uwoReviewFixture !== marker) throw new Error('fixture marker 安裝失敗');
    function replace(target, key, fn) { saved.push([target, key, target[key]]); target[key] = fn; wrappers.push([target, key, fn]); if (target[key] !== fn) throw new Error('fixture API 安裝失敗'); }
    function clone(value) { return JSON.parse(JSON.stringify(value)); }
    var at = '2026-10-01T00:00:00.000Z';
    var report = { reportId: 'fixture-report-1', officerId: 'officer_chast089', errorTypes: ['text'], description: '原始描述：航海士資料需核對', suggestedCorrection: '請核對文字', sourceUrl: 'https://example.invalid/original', screenshotFileIds: ['/assets/ui/share-action-icon.png'], supplement: '原始補充', status: name === 'error-report-mine' ? 'needsInfo' : 'pending', reviewReply: '請補充來源', fixedDatasetVersion: null, supplements: [{ text: '第一次補充', sourceUrl: 'https://example.invalid/first', screenshotFileIds: ['/assets/ui/config-paper-texture.png'], createdAt: at }, { text: '', sourceUrl: 'https://example.invalid/second', screenshotFileIds: [], createdAt: at }, { text: '', sourceUrl: '', screenshotFileIds: ['/assets/ui/share-action-icon.png'], createdAt: at }, { text: '', sourceUrl: '', screenshotFileIds: [], createdAt: at }], history: [{ action: 'createReport', reason: null, actorRole: 'owner', at: at, revision: 1 }, { action: 'requestReportInfo', reason: '請補充來源', actorRole: 'admin', at: at, revision: 2 }], revision: 2, createdAt: at, updatedAt: at };
    function failure(code) { return { result: { ok: false, code: code || 'unknown-action', message: '離線驗收不支持此操作' } }; }
    function success(value) { return { result: { ok: true, data: clone(value) } }; }
    replace(wx.cloud, 'callFunction', function(input) {
      input = input || {}; var data = input.data || {}; var action = data.action; var response;
      if (input.name === 'coupon-redemption' && name.indexOf('coupon-') === 0) {
        response = name === 'coupon-success' ? success({ code: 'success', message: '兌換成功' }) : name === 'coupon-known-failure' ? { result: { ok: false, code: 'coupon-used', message: '此兌換碼已使用' } } : { result: { ok: false, code: 'unknown', message: '結果未確認，請先到官方頁面確認再嘗試。' } };
      } else if (input.name === 'fleet-config' && action === 'authenticate') response = success({ authenticated: true });
      else if (input.name === 'officer-custom' && action === 'getAdminStatus') response = success({ isAdmin: name === 'error-report-review' });
      else if (input.name === 'officer-maintenance' && name.indexOf('error-report-') === 0) {
        if (action === 'listMyReports') response = success([report]);
        else if (action === 'listReportsForAdmin') response = success(data.status === report.status ? [report] : []);
        else if (action === 'createReport') { report = Object.assign({}, report, data, { reportId: 'fixture-report-1', status: 'pending' }); response = success(report); }
        else if (['appendReportSupplement', 'requestReportInfo', 'acceptReport', 'rejectReport', 'markReportFixed'].indexOf(action) >= 0) {
          if (data.reportId !== report.reportId) response = failure('not-found');
          else if (data.revision !== report.revision) response = failure('conflict');
          else {
            if (action === 'appendReportSupplement') { report.status = 'pending'; report.supplements.push({ text: data.text || '', sourceUrl: data.sourceUrl || '', screenshotFileIds: data.screenshotFileIds || [], createdAt: at }); }
            else { report.status = { requestReportInfo: 'needsInfo', acceptReport: 'accepted', rejectReport: 'rejected', markReportFixed: 'fixed' }[action]; report.reviewReply = data.reply || ''; if (action === 'markReportFixed') report.fixedDatasetVersion = data.datasetVersion; }
            report.revision++; report.history.push({ action: action, reason: data.reply || null, actorRole: action === 'appendReportSupplement' ? 'owner' : 'admin', at: at, revision: report.revision }); response = success(report);
          }
        } else response = failure();
      } else response = failure();
      if (input.success) input.success(response); if (input.complete) input.complete(response); return Promise.resolve(response);
    });
    replace(wx.cloud, 'uploadFile', function() { return Promise.resolve({ fileID: '/assets/ui/share-action-icon.png' }); });
    replace(wx.cloud, 'getTempFileURL', function(input) { return Promise.resolve({ fileList: (input.fileList || []).map(function(file) { return { fileID: typeof file === 'string' ? file : file.fileID, tempFileURL: '/assets/ui/share-action-icon.png', status: 0 }; }) }); });
    if (name.indexOf('error-report-') === 0 && typeof wx.chooseMedia === 'function') replace(wx, 'chooseMedia', function(input) { var result = { tempFiles: [{ tempFilePath: '/assets/ui/share-action-icon.png', size: 1, fileType: 'image' }], type: 'image' }; if (input.success) input.success(result); if (input.complete) input.complete(result); return Promise.resolve(result); });
    if (name.indexOf('coupon-') === 0) {
      var originalRead = wx.getStorageSync;
      var store = { activeProfileId: 'fixture-player-a', profiles: [{ id: 'fixture-player-a', name: '測試玩家 A', gameServerId: 'UWOGL-JP-02', userNo: 'fixture-user-a' }, { id: 'fixture-player-b', name: '測試玩家 B', gameServerId: 'UWOGL-JP-03', userNo: 'fixture-user-b' }] };
      replace(wx, 'getStorageSync', function(key) { return key === 'coupon_profiles_v1' ? clone(store) : originalRead.call(wx, key); });
      replace(wx, 'setStorageSync', function(key, value) { if (key === 'coupon_profiles_v1') store = clone(value); else throw new Error('離線驗收禁止寫入其他 storage'); });
    }
    return wrappers.every(function(item) { return item[0][item[1]] === item[2]; }) ? 'uwo-review-fixture:' + name : null;
  }`
}

export const fixtureRestoreSource = `function () {
  var marker = wx.__uwoReviewFixture;
  if (!marker) return 'uwo-review-fixture:restored';
  marker.saved.slice().reverse().forEach(function(item) { item[0][item[1]] = item[2]; });
  if (!marker.saved.every(function(item) { return item[0][item[1]] === item[2]; })) throw new Error('fixture API 恢復失敗');
  delete wx.__uwoReviewFixture;
  if (wx.__uwoReviewFixture) throw new Error('fixture marker 恢復失敗');
  return 'uwo-review-fixture:restored';
}`

export const createFixtureLifecycle = (evaluate: (source: string) => Promise<unknown>) => {
  let active = false
  const restoreFixture = async (): Promise<void> => {
    if (!active) return
    if ((await evaluate(fixtureRestoreSource)) !== 'uwo-review-fixture:restored')
      throw new Error('fixture 恢復 marker 無效')
    active = false
  }
  return {
    async installFixture(name: ReviewFixtureName) {
      await restoreFixture()
      active = true
      try {
        if ((await evaluate(fixtureInstallSource(name))) !== `uwo-review-fixture:${name}`)
          throw new Error('fixture 安裝 marker 無效，禁止開啟目標頁')
      } catch (error) {
        await restoreFixture()
        throw error
      }
    },
    restoreFixture,
  }
}
