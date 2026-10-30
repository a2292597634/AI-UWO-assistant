# 大流行單開關批次訂閱實施計畫

> 執行者：使用subagent-driven-development依序實作，每任務獨立審查；所有commit步驟由用戶確認規則取代，本次不提交。

**目標：** 一次開關、一次微信原生批次授權、一次完整廣告，自動安排3h/1h/10m且無自建面板。
**架構：** 向後兼容新增batch API與模板registry，slot/job綁定各自模板；新版頁面用直接toggle控制器，先同步授權再異步服務及廣告。
**技術：** TypeScript、微信SDK、CloudBase、wx-server-sdk4.0.2、Node22、Vitest，無依賴變更。

## 全域約束

- 沿用隔離工作區 C:/Users/XB/.codex/worktrees/major-event-reminders/AI UWO assistant，分支 codex/phase-62-major-event-reminders，Git基線c48d373；本輪基線另取目前未提交已驗證功能快照，不能把舊功能當新改動。原E工作區254檔保持只讀，不commit/push/合併，不新增或升級依賴。
- 介面／資料文字繁體中文，註釋文件中文。前端唯一新增網路入口仍為runtime/major-event-reminder-service.ts固定major-event-reminder的wx.cloud.callFunction，不擴大白名單。Node22固定C:/Users/XB/.codex/runtimes/uwo-review-node22/node-v22.23.3-win-x64/node.exe，Cloud SDK4.0.2不變。
- 3時點固定10800、3600、600秒；已過不補發，20場上限、30天終態保留、300秒發送恢復窗口且不晚於開始不變。只認isEnded===true，一場完整廣告可恢復免重看；未知外部發送不得重試。
- 現有普通一次性模板及現有pending/sending/sent/unknown任務必須兼容，不能因新增多模板把舊job當data-changed。不能刪既有廣告權益／授權、既有v1本機pending操作或重看廣告。
- owner只取getWXContext().OPENID，丟棄平台userInfo/tcbContext；其他未知payload欄位仍拒絕。repo精確缺文件轉null及生成副本既有修復保留；archive/master不改，共享產物只由既有generate產生。
- 新流程：頁面只有既有提醒訂閱開關，三處位置不變，保留緊湊雙行與大字；移除自建提醒浮層及三個自建授權按鈕。原生微信授權不可省。
- 點開關開通時，必須在第一個await／服務呼叫之前同步發起wx.requestSubscribeMessage，一次帶當下可用的不同標題模板。使用onShow預載配置，不在異步prepare之後才要求原生授權；不可在廣告結束後自動要求授權。
- 尚未完整接受所有仍有效時點時，不播放新廣告、不新建任務，開關按服務端確認保持關閉，原生Toast說明。完整接受後prepareBatch→authorizeBatch→完整廣告→completeAd；同場已完成廣告走activate免重看。遇時點跨界仍保存有效完整廣告，不鎖死其他場。
- 取消直接取消尚未發送項目，不開自建面板；sending/unknown不可撤回要Toast說明。授權、廣告、服務錯誤與部分過期用Toast，不能宣稱3次而實際少於3。恢復、跨頁舊回應、銷毀後廣告完成沿用既有安全守衛。
- 保留舊getConfig/prepare/authorize/completeAd/activate/cancel/list輸入輸出，舊客戶端繼續有效；新增API獨立，不給舊嚴格回應額外欄位。部署worker先兼容，再business，再新預覽；保持既有legacy env ID/fields，追加batch registry。子任務不部署/不操作真授權廣告，父負責部署與原生驗收。
- UI執行者編碼前完整讀Design Foundation和2026-09-16-miniprogram-review-html-report-design.md。邏輯TDD，原生真機與模擬器／fixture區分；交付HTML含可見截圖。密鑰只在既有ignored操作配置與雲env，絕不輸出Timer token或CustomArgument。

## 新增共享接口

ReminderBatchConfig = {enabled:boolean, reason:string|null, adUnitId:string, templates:Array<{leadSeconds:10800|3600|600, templateId:string, title:string}>}。啟用時順序為3h/1h/10m，恰3個、ID與標題均唯一；停用時templates=[]。字段映射不傳給客戶端。

新增ReminderInputs：getBatchConfig:{}；prepareBatch:{occurrence:ReminderOccurrence,requestId:string}；authorizeBatch:{sessionId:string,templateIds:string[],requestId:string}。
新增ReminderOutputs：getBatchConfig:ReminderBatchConfig；prepareBatch:{sessionId:string,subscription:ReminderSubscription}；authorizeBatch:{subscription:ReminderSubscription}。
舊DTO、envelope、三元場次鍵及既有action完全不變。authorizeBatch只接受會話綁定的已知模板，無重複，且覆蓋操作時仍有效的必要時點；已過的已知模板可忽略，不補發。缺少有效時點授權原子拒絕，不建立新job。session區分batch/legacy；舊session沒有mode按legacy。

服務端新增MAJOR_REMINDER_BATCH_TEMPLATES，值為下列精確JSON陣列。舊MAJOR_REMINDER_TEMPLATE_ID/FIELDS/STATE繼續保留，供舊API與已排任務使用。每slot/job的templateId由服務端會話綁定決定；舊slot無templateId回退legacy ID。worker按job.templateId解析合法模板及字段；batch配置暫缺不得中斷legacy作業，也不把暫缺registry的新job錯判未知而直接失敗。每job/user/template鎖、generation、cancel epoch等保留。

[
  {
    "leadSeconds": 10800,
    "title": "活动参与通知",
    "templateId": "1miDALegzuZsXq5LMuhrVHbzXmDZjkKMi8Ptsb4BZHk",
    "fields": [
      {
        "source": "start",
        "key": "time3",
        "type": "time"
      },
      {
        "source": "activity",
        "key": "thing1",
        "type": "thing"
      }
    ]
  },
  {
    "leadSeconds": 3600,
    "title": "新活动提醒",
    "templateId": "fDGQsVTlzzNVwijisyYtWOcfxJja9D313jwdrC3OqTw",
    "fields": [
      {
        "source": "start",
        "key": "time2",
        "type": "time"
      },
      {
        "source": "activity",
        "key": "thing10",
        "type": "thing"
      }
    ]
  },
  {
    "leadSeconds": 600,
    "title": "会员活动提醒",
    "templateId": "GA4kBg2dWEYKW6mhdToYZdCx5O_r_maAgm3qJkR5HMw",
    "fields": [
      {
        "source": "start",
        "key": "time4",
        "type": "time"
      },
      {
        "source": "activity",
        "key": "thing1",
        "type": "thing"
      }
    ]
  }
]

### Task1：後端批次契約與舊任務相容

檔案：contracts/major-event-reminder.ts，cloudfunctions/major-event-reminder/{config,service}.js，worker/worker.js，相關tests/major-event-reminder與configuration example、architecture文件；worker/shared只能generate產生。若擴充ReminderAction導致舊controller的Mutation聯集含新讀取/批次操作，僅將該舊Mutation暫時限定為原五mutation，保證Task1 typecheck，Task2再改完整流程，不改舊客戶端行為。

- [ ] 新增紅燈：getBatchConfig格式與3不同標題／ID／lead／fields；prepareBatch與authorizeBatch持久化三個正確綁定；拒不完整／錯ID／重複、跨owner/session、舊版本及過期；原request重放不新增。
- [ ] 驗證原legacy prepare→authorize→completeAd仍用primary；既有無templateId的pending job在新config下仍可正常send；batch三job使用各自ID與對應time3/thing1、time2/thing10、time4/thing1。
- [ ] 紅燈worker覆蓋generation/epoch/unknown與取消、registry暫缺仍允許legacy且不破壞已排新job；不得把舊job全標data-changed。
- [ ] 實作最小registry/新action/session binding與slot/job模板，保留舊response四鍵。authorizeBatch要求所有當下有效時點已接受，過期已知模板不補發。completeAd跨時點仍保存權益、不鎖死恢復。
- [ ] 以Node22 vitest run tests/major-event-reminder tests/integration/major-event-reminder-client.test.ts，先確認紅、實作後綠；generate同步shared並比較其它生成物無漂移；tsc/lint/format/network。
- [ ] task-1-report記載修改、紅綠命令及輸出；禁止部署。

### Task2：一次點擊控制器與移除自建面板

消費Task1精確新增接口，檔案：runtime service/platform，reminder controller，popularity/index.ts/wxml/wxss，相關runtime/pages/integration/architecture tests，tools/miniprogram-review fixtures與保存場景。完整讀Design Foundation與HTML驗收規範。

- [ ] 紅燈驗證toggle當下同步subscribeMany且僅一次，傳入當下未過期3/2/1個不同ID，任何雲服務呼叫在其後；未完整接受則不播廣告不開通。
- [ ] 真backend本地整合：一次原生接受3ID、一次ad完整→三個job且checkbox serverconfirmed；cancel、同場免重看、net未知重放相同request、v1 pending/adFinished升級、舊控制器遲到不得覆寫新場、廣告跨過時點不鎖死。
- [ ] 實作同步原生批次API、onShow預載配置、toggle直接鏈路；讀取action均不寫pending，保存每次mutation原requestId。已訂閱toggle只取消，不授權或ad。銷毀與廣告單例沿用安全處理。
- [ ] 頁面三處仍catchtap與唯一提醒訂閱標籤，移除提醒面板/三授權按鈕/handler及不用樣式，其他日程詳情/矩陣/雙行字體不改。Toast精確顯示實際開通數和錯誤。
- [ ] 更新無配置fixture以getBatchConfig，保存自然點擊場景assert無自建面板、三處列表詳情入口仍在；不偽造成功授權或廣告。
- [ ] 執行runtime/controller/page/integration/architecture、tsc/lint/format/network，task-2-report及範圍清單；禁止部署及真機/原生會話競爭。

### Task3：整體驗證與相容部署

- [ ] 原E254指紋與本輪baseline保護；Node22完整verify、diff-check；全面獨立審查及必要單輪fix wave。
- [ ] worker先部署並保留primary env，追加batch registry精確JSON；官方微信CLI同步send權限，安全規則只禁worker，token不輸出；核對Timer密鑰與timeout60。再部署business並追加相同registry，舊getConfig與現有pending維持。
- [ ] 複核既有pending任務狀態/模板未改，不能當測試資料刪除。新版getBatchConfig enabled且3個ID；真Timer成功，不用假授權或假ad建立真job。
- [ ] iterate/final自然點擊與HTML圖，讀取實際截圖；使用新預覽QR請用戶做一次批次授權和完整廣告，再查任務。真機未驗部分明示，無公開發版/commit/push。
