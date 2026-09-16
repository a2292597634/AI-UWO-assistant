import { basename, isAbsolute, relative, resolve, sep } from 'node:path'

import type { ReviewReport, ReviewResultStatus } from './report'
import type { ScenarioRunResult, StepRunResult } from './runner'

const actionLabels: Record<string, string> = {
  navigate: '跳转页面',
  switchTab: '切换 Tab',
  tap: '点击',
  input: '输入',
  clearInput: '清空输入',
  scrollPage: '滚动页面',
  scrollElement: '滚动元素',
  waitFor: '等待',
  assertExists: '存在断言',
  assertVisible: '可见断言',
  assertText: '文字断言',
  screenshot: '截图',
}

const statusLabels: Record<ReviewResultStatus, string> = {
  passed: '通过',
  failed: '失败',
  blocked: '阻塞',
}

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

export { escapeHtml }

export const toReportAssetPath = (outputDir: string, assetPath: string): string | undefined => {
  const outputRoot = resolve(outputDir)
  const target = resolve(assetPath)
  const assetRelative = relative(outputRoot, target)
  if (
    assetRelative === '' ||
    isAbsolute(assetRelative) ||
    assetRelative === '..' ||
    assetRelative.startsWith(`..${sep}`)
  ) {
    return undefined
  }
  return assetRelative.split(sep).join('/')
}

const statusIcon = (status: ReviewResultStatus): string => `status-${status}`

const icon = (name: string, label: string): string =>
  `<svg class="icon icon-${escapeHtml(name)}" role="img" aria-label="${escapeHtml(label)}"><use href="#${escapeHtml(name)}"></use></svg>`

const statusBadge = (status: ReviewResultStatus): string =>
  `<span class="status-badge status-${status}">${icon(statusIcon(status), statusLabels[status])}${escapeHtml(statusLabels[status])}</span>`

const formatTime = (value: string | undefined): string => value ?? '未记录'

const renderAsset = (outputDir: string, assetPath: string, label: string): string => {
  const relativePath = toReportAssetPath(outputDir, assetPath)
  if (!relativePath) {
    return `<span class="evidence-missing">无法在报告目录内预览：${escapeHtml(assetPath)}</span>`
  }
  const alt = `${label}：${basename(assetPath)}`
  return `<a class="screenshot-link" href="${escapeHtml(relativePath)}" data-lightbox-src="${escapeHtml(relativePath)}" data-lightbox-alt="${escapeHtml(alt)}"><img loading="lazy" src="${escapeHtml(relativePath)}" alt="${escapeHtml(alt)}"><span>${escapeHtml(basename(assetPath))}</span></a>`
}

const renderScreenshotList = (outputDir: string, paths: string[], label: string): string => {
  if (paths.length === 0) return '<p class="muted">没有截图证据。</p>'
  return `<div class="screenshot-grid">${paths.map((path) => renderAsset(outputDir, path, label)).join('')}</div>`
}

const renderStep = (outputDir: string, step: StepRunResult, index: number): string => {
  const action = actionLabels[step.action] ?? '未知动作'
  const error = step.error ? `<p class="step-error">${escapeHtml(step.error)}</p>` : ''
  const screenshot = step.screenshotPath
    ? `<div class="step-evidence">${renderAsset(outputDir, step.screenshotPath, `步骤 ${index + 1}`)}</div>`
    : ''
  return `<li class="step step-${step.status}">
    <div class="step-heading">${icon(`icon-${step.action}`, action)}<span class="step-number">${index + 1}</span><span class="step-action">${escapeHtml(action)}</span><span class="step-duration">${step.durationMs} ms</span><span class="step-status">${escapeHtml(step.status === 'passed' ? '通过' : '失败')}</span></div>
    <div class="step-meta"><span>开始：${escapeHtml(formatTime(step.startedAt))}</span></div>
    ${error}${screenshot}
  </li>`
}

const renderScenario = (outputDir: string, result: ScenarioRunResult): string => {
  const steps = result.steps.length
    ? `<ol class="step-list">${result.steps.map((step, index) => renderStep(outputDir, step, index)).join('')}</ol>`
    : '<p class="muted">没有步骤记录。</p>'
  const error = result.error ? `<p class="scenario-error">${escapeHtml(result.error)}</p>` : ''
  const failure = result.failureScreenshot
    ? `<section class="evidence-section"><h4>失败现场</h4>${renderScreenshotList(outputDir, [result.failureScreenshot], '失败现场')}</section>`
    : ''
  const screenshots = result.screenshots.length
    ? `<section class="evidence-section"><h4>截图证据</h4>${renderScreenshotList(outputDir, result.screenshots, '场景截图')}</section>`
    : ''
  return `<details class="scenario-card"${result.status === 'failed' || result.status === 'blocked' ? ' open' : ''}>
    <summary><span class="summary-title">${escapeHtml(result.scenario)}</span>${statusBadge(result.status)}<span class="summary-page">${escapeHtml(result.pagePath)}</span></summary>
    <div class="scenario-body"><div class="scenario-meta"><span>数据状态：${escapeHtml(result.state)}</span><span>步骤：${result.steps.length}</span></div>${error}${steps}${screenshots}${failure}</div>
  </details>`
}

const renderIteration = (
  outputDir: string,
  iteration: ReviewReport['iterations'][number],
  index: number,
): string => {
  const changedFiles = iteration.changedFiles.length
    ? `<ul class="file-chips">${iteration.changedFiles
        .map((file) => `<li title="${escapeHtml(file)}">${escapeHtml(file)}</li>`)
        .join('')}</ul>`
    : '<p class="muted">没有记录到变更文件。</p>'
  const before = iteration.beforeScreenshot
    ? `<div class="iteration-evidence"><h4>修改前基线</h4>${renderAsset(outputDir, iteration.beforeScreenshot, '修改前')}</div>`
    : '<div class="iteration-evidence"><h4>修改前基线</h4><p class="evidence-missing">本轮没有可信基线截图。</p></div>'
  const after = `<div class="iteration-evidence"><h4>修改后截图</h4>${renderScreenshotList(outputDir, iteration.afterScreenshots, '修改后')}</div>`
  const notes = iteration.notes.length
    ? `<ul class="notes">${iteration.notes.map((note) => `<li>${escapeHtml(note)}</li>`).join('')}</ul>`
    : '<p class="muted">没有补充修改说明。</p>'
  return `<li class="iteration-card iteration-${iteration.status}">
    <div class="iteration-heading"><span class="iteration-index">第 ${index + 1} 轮</span>${statusBadge(iteration.status)}<time>${escapeHtml(formatTime(iteration.startedAt))}</time></div>
    <h3>${escapeHtml(iteration.summary)}</h3>
    <p class="iteration-finished">结束：${escapeHtml(formatTime(iteration.finishedAt))}</p>
    <h4>变更文件</h4>${changedFiles}
    <div class="iteration-evidence-grid">${before}${after}</div>
    <h4>修改说明</h4>${notes}
  </li>`
}

const iconSymbols = `
<svg class="icon-definitions" aria-hidden="true" focusable="false">
  <symbol id="status-passed" viewBox="0 0 24 24"><path d="M5 12.5 9.5 17 19 7.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></symbol>
  <symbol id="status-failed" viewBox="0 0 24 24"><path d="m7 7 10 10M17 7 7 17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></symbol>
  <symbol id="status-blocked" viewBox="0 0 24 24"><path d="M6 6h12v12H6zM9 9h6v6H9z" fill="none" stroke="currentColor" stroke-width="2"/></symbol>
  <symbol id="icon-navigate" viewBox="0 0 24 24"><path d="m5 4 14 8-14 8 3-8-3-8Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></symbol>
  <symbol id="icon-switchTab" viewBox="0 0 24 24"><path d="M4 7h16M4 12h10M4 17h16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></symbol>
  <symbol id="icon-tap" viewBox="0 0 24 24"><path d="M9 11V5a2 2 0 0 1 4 0v6m0-2a2 2 0 0 1 4 0v3m0-1a2 2 0 0 1 4 0v3c0 5-3 7-7 7h-1c-3 0-5-2-7-5l-2-3a2 2 0 0 1 3-2l2 2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></symbol>
  <symbol id="icon-input" viewBox="0 0 24 24"><path d="M5 7h14M5 12h14M5 17h9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="m17 15 3 3-3 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></symbol>
  <symbol id="icon-clearInput" viewBox="0 0 24 24"><path d="M5 7h10M5 12h7M5 17h10m3-8 4 4m0-4-4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></symbol>
  <symbol id="icon-scrollPage" viewBox="0 0 24 24"><path d="M12 4v16m0-16-4 4m4-4 4 4m-4 12 4-4m-4 4-4-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></symbol>
  <symbol id="icon-scrollElement" viewBox="0 0 24 24"><path d="M5 5h14v14H5zM12 8v8m0-8-3 3m3-3 3 3m-3 5 3-3m-3 3-3-3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></symbol>
  <symbol id="icon-waitFor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 8v5l3 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></symbol>
  <symbol id="icon-assertExists" viewBox="0 0 24 24"><path d="M4 12s3-6 8-6 8 6 8 6-3 6-8 6-8-6-8-6Z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="2" fill="none" stroke="currentColor" stroke-width="2"/></symbol>
  <symbol id="icon-assertVisible" viewBox="0 0 24 24"><path d="m5 12 4 4L19 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></symbol>
  <symbol id="icon-assertText" viewBox="0 0 24 24"><path d="M5 7h14M5 12h10M5 17h7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></symbol>
  <symbol id="icon-screenshot" viewBox="0 0 24 24"><path d="M5 7h3l1.5-2h5L16 7h3v12H5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="13" r="3" fill="none" stroke="currentColor" stroke-width="2"/></symbol>
</svg>`

const styles = `
:root{color-scheme:light;--ink:#26332f;--canvas:#e7deca;--surface:#f5efe0;--surface-strong:#fffaf0;--brass:#b99552;--danger:#8b3a3a;--blocked:#7a5a2a;--muted:#6b7169;--line:#d3c5a8;--shadow:0 10px 28px rgba(38,51,47,.12)}
*{box-sizing:border-box}body{margin:0;background:var(--canvas);color:var(--ink);font-family:system-ui,-apple-system,"Segoe UI","Microsoft JhengHei",sans-serif;line-height:1.55}main{max-width:1180px;margin:0 auto;padding:24px 18px 56px}.report-header{background:var(--ink);color:#fffaf0;border-radius:20px;padding:28px 30px;box-shadow:var(--shadow)}.eyebrow{margin:0 0 6px;color:#e1c98f;font-size:13px;letter-spacing:.12em}.report-header h1{margin:0;font-size:clamp(24px,4vw,38px);line-height:1.2}.header-row{display:flex;flex-wrap:wrap;align-items:center;gap:12px;margin-top:16px}.run-id{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;color:#e8dfc8;font-size:13px}.status-badge{display:inline-flex;align-items:center;gap:5px;border-radius:999px;padding:4px 10px;font-size:13px;font-weight:700;white-space:nowrap;background:#d8e4d5;color:#20482d}.status-failed{background:#f1d4d0;color:var(--danger)}.status-blocked{background:#f1dfb6;color:var(--blocked)}.report-header .status-passed{background:#d8e4d5;color:#20482d}.report-header .status-failed{background:#f1d4d0;color:#7e2929}.report-header .status-blocked{background:#f1dfb6;color:#6e4a18}.icon{width:17px;height:17px;display:inline-block;flex:none;vertical-align:-3px}.icon-definitions{position:absolute;width:0;height:0;overflow:hidden}.meta-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin-top:18px;color:#e8dfc8;font-size:13px}.section{margin-top:24px}.section h2{display:flex;align-items:center;gap:9px;margin:0 0 12px;font-size:22px}.summary-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}.summary-card,.scenario-card,.iteration-card,.coverage-card{background:var(--surface);border:1px solid var(--line);border-radius:16px;box-shadow:var(--shadow)}.summary-card{padding:16px}.summary-card .value{font-size:32px;font-weight:800;line-height:1}.summary-card .label{display:block;margin-top:8px;color:var(--muted);font-size:13px}.summary-card .icon{width:22px;height:22px;color:var(--brass)}.timeline{padding-left:0;list-style:none;margin:0;display:grid;gap:14px}.iteration-card{padding:20px}.iteration-heading{display:flex;align-items:center;flex-wrap:wrap;gap:9px}.iteration-index{font-weight:800;font-size:18px}.iteration-heading time,.iteration-finished{color:var(--muted);font-size:13px}.iteration-card h3{margin:12px 0 2px;font-size:19px}.iteration-card h4,.evidence-section h4{margin:16px 0 8px;font-size:13px;color:var(--muted);letter-spacing:.03em}.file-chips{display:flex;flex-wrap:wrap;gap:7px;margin:0;padding:0;list-style:none}.file-chips li{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border-radius:999px;background:#e9ddc2;padding:5px 10px;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12px}.iteration-evidence-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px}.iteration-evidence{min-width:0}.screenshot-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}.screenshot-link{display:flex;flex-direction:column;gap:5px;color:var(--ink);text-decoration:none;font-size:12px;min-width:0}.screenshot-link img{display:block;width:100%;aspect-ratio:3/4;object-fit:cover;background:#d9ccb1;border:1px solid var(--line);border-radius:11px;cursor:zoom-in}.screenshot-link>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.evidence-missing{margin:0;padding:12px;border:1px dashed var(--line);border-radius:10px;color:var(--muted);font-size:13px}.notes{margin:0;padding-left:20px}.empty-state{padding:18px;border:1px dashed var(--line);border-radius:14px;background:rgba(245,239,224,.7);color:var(--muted)}.scenario-list{display:grid;gap:10px}.scenario-card{overflow:hidden}.scenario-card summary{display:flex;align-items:center;flex-wrap:wrap;gap:9px;padding:15px 17px;cursor:pointer;list-style:none}.scenario-card summary::-webkit-details-marker{display:none}.scenario-card summary::before{content:"＋";color:var(--brass);font-size:18px}.scenario-card[open] summary::before{content:"−"}.summary-title{font-weight:800}.summary-page{color:var(--muted);font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12px;margin-left:auto}.scenario-body{padding:0 17px 18px}.scenario-meta{display:flex;flex-wrap:wrap;gap:14px;color:var(--muted);font-size:13px}.scenario-error,.step-error{color:var(--danger);background:#f7e2dc;border-left:3px solid var(--danger);padding:9px 11px;margin:12px 0}.step-list{display:grid;gap:8px;margin:15px 0 0;padding:0;list-style:none}.step{padding:11px 12px;border-radius:11px;background:var(--surface-strong);border:1px solid var(--line)}.step-failed{border-color:#d69b92;background:#fff4ef}.step-heading{display:flex;align-items:center;gap:7px;flex-wrap:wrap}.step-heading .icon{color:var(--brass)}.step-number{font-weight:800}.step-duration{margin-left:auto;color:var(--muted);font-size:12px}.step-status{font-size:12px;font-weight:700;color:#286038}.step-failed .step-status{color:var(--danger)}.step-meta{color:var(--muted);font-size:12px;margin-top:4px}.step-evidence{margin-top:10px;max-width:180px}.evidence-section{margin-top:18px}.muted{margin:8px 0;color:var(--muted);font-size:13px}.coverage-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px}.coverage-card{padding:16px}.coverage-card h3{margin:0 0 8px;font-size:16px}.coverage-card ul{margin:0;padding-left:20px}.raw-report{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:14px}.raw-report summary{cursor:pointer;font-weight:700}.raw-report pre{max-height:480px;overflow:auto;background:var(--surface-strong);padding:14px;border-radius:10px;font-size:12px;white-space:pre-wrap;overflow-wrap:anywhere}.report-footer{margin-top:24px;color:var(--muted);font-size:12px;text-align:center}dialog{border:0;border-radius:16px;padding:0;max-width:min(92vw,980px);background:#17231f;color:#fffaf0;box-shadow:0 20px 70px rgba(0,0,0,.35)}dialog::backdrop{background:rgba(18,25,23,.72)}.lightbox-inner{padding:14px}.lightbox-inner img{display:block;max-width:88vw;max-height:78vh;margin:auto;object-fit:contain}.lightbox-caption{margin:9px 0 0;color:#e8dfc8;font-size:13px}.lightbox-close{display:block;margin:0 0 0 auto;border:1px solid #d8c89f;background:transparent;color:#fffaf0;border-radius:8px;padding:5px 10px;cursor:pointer}@media(max-width:620px){main{padding:12px 10px 40px}.report-header{padding:22px 20px;border-radius:15px}.summary-page{width:100%;margin-left:0}.scenario-card summary{padding:13px}.step-duration{margin-left:0}}
`

const lightboxScript = `
(() => {
  const dialog = document.getElementById('review-lightbox');
  const image = document.getElementById('review-lightbox-image');
  const caption = document.getElementById('review-lightbox-caption');
  if (!(dialog instanceof HTMLDialogElement) || !(image instanceof HTMLImageElement) || !(caption instanceof HTMLElement)) return;
  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const trigger = event.target.closest('[data-lightbox-src]');
    if (!(trigger instanceof HTMLElement)) return;
    const src = trigger.dataset.lightboxSrc;
    if (!src) return;
    event.preventDefault();
    image.src = src;
    image.alt = trigger.dataset.lightboxAlt ?? '';
    caption.textContent = trigger.dataset.lightboxAlt ?? '';
    dialog.showModal();
  });
  document.addEventListener('click', (event) => {
    if (!(event.target instanceof HTMLElement)) return;
    if (event.target.matches('[data-lightbox-close]') || event.target === dialog) dialog.close();
  });
  dialog.addEventListener('cancel', () => dialog.close());
})();
`

const listItems = (values: string[]): string =>
  values.length
    ? `<ul>${values.map((value) => `<li>${escapeHtml(value)}</li>`).join('')}</ul>`
    : '<p class="muted">无</p>'

const countFailedSteps = (report: ReviewReport): number =>
  report.results.reduce(
    (count, result) => count + result.steps.filter((step) => step.status === 'failed').length,
    0,
  )

export const renderReviewReportHtml = (report: ReviewReport, outputDir: string): string => {
  const iterationSection = report.iterations.length
    ? `<ol class="timeline">${report.iterations.map((iteration, index) => renderIteration(outputDir, iteration, index)).join('')}</ol>`
    : '<p class="empty-state">本次运行未附带修改轮次；以下为场景验收结果。</p>'
  const scenarios = report.results.length
    ? `<div class="scenario-list">${report.results.map((result) => renderScenario(outputDir, result)).join('')}</div>`
    : '<p class="empty-state">本次没有可展示的场景结果。</p>'
  const failedSteps = countFailedSteps(report)
  const rawJson = escapeHtml(JSON.stringify(report, null, 2))

  return `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>小程序页面验收报告</title>
<style>${styles}</style>
</head>
<body class="status-${report.status}">
${iconSymbols}
<main>
  <header class="report-header">
    <p class="eyebrow">LOCAL MINI PROGRAM REVIEW</p>
    <h1>小程序页面验收报告</h1>
    <div class="header-row">${statusBadge(report.status)}<span class="run-id">运行编号：${escapeHtml(report.runId)}</span></div>
    <div class="meta-grid"><span>生成时间：${escapeHtml(report.generatedAt)}</span><span>Git commit：${escapeHtml(report.git.commit)}</span><span>工作区：${report.git.dirty ? '有未提交修改' : '干净'}</span><span>场景数：${report.results.length}</span></div>
  </header>

  <section class="section" aria-labelledby="summary-heading"><h2 id="summary-heading">验收摘要</h2><div class="summary-grid">
    <article class="summary-card">${icon('status-passed', '已覆盖')}<div class="value">${report.coverage.covered.length}</div><span class="label">已覆盖</span></article>
    <article class="summary-card">${icon('status-blocked', '待人工')}<div class="value">${report.coverage.manual.length + report.coverage.manualStates.length}</div><span class="label">待人工核验</span></article>
    <article class="summary-card">${icon('status-blocked', '豁免')}<div class="value">${report.coverage.exempted.length}</div><span class="label">豁免项目</span></article>
    <article class="summary-card">${icon('status-failed', '失败步骤')}<div class="value">${failedSteps}</div><span class="label">失败步骤</span></article>
  </div></section>

  <section class="section" aria-labelledby="timeline-heading"><h2 id="timeline-heading">修改过程</h2>${iterationSection}</section>

  <section class="section" aria-labelledby="scenario-heading"><h2 id="scenario-heading">场景与步骤</h2>${scenarios}</section>

  <section class="section" aria-labelledby="coverage-heading"><h2 id="coverage-heading">覆盖与人工核验</h2><div class="coverage-grid">
    <article class="coverage-card"><h3>已覆盖</h3>${listItems(report.coverage.covered)}</article>
    <article class="coverage-card"><h3>豁免</h3>${report.coverage.exempted.length ? `<ul>${report.coverage.exempted.map((item) => `<li><strong>${escapeHtml(item.target)}</strong>：${escapeHtml(item.reason)}</li>`).join('')}</ul>` : '<p class="muted">无</p>'}</article>
    <article class="coverage-card"><h3>待人工设备</h3>${listItems(report.coverage.manual)}</article>
    <article class="coverage-card"><h3>待人工状态</h3>${listItems(report.coverage.manualStates)}</article>
  </div></section>

  <section class="section"><details class="raw-report"><summary>查看原始 JSON</summary><pre>${rawJson}</pre></details></section>
  <p class="report-footer">报告由本地验收工具生成；截图仅引用当前报告目录内的文件。</p>
</main>
<dialog id="review-lightbox" aria-label="截图预览"><div class="lightbox-inner"><button class="lightbox-close" type="button" data-lightbox-close>关闭</button><img id="review-lightbox-image" alt=""><p id="review-lightbox-caption" class="lightbox-caption"></p></div></dialog>
<script>${lightboxScript}</script>
</body>
</html>
`
}
