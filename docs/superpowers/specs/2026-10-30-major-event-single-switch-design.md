# 大流行單開關批次訂閱設計

用戶2026-10-30明確要求取消自建子面板，以一次開關完成授權／廣告及三時點提醒；已接受「單開關→微信一次授權→廣告→三次提醒」方案並補齊三個不同標題模板與字段。此次是已批准功能的必要互動簡化，不另詢問實作選項。使用brainstorming核對平台限制，並以writing-plans及subagent-driven-development連續執行。

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

## 恢復與相容細節

原生授權最先同步發起，回調後才做新會話與批次登記。任何仍有效模板未accept，不顯示廣告；不以accept偏好推算額度。已過時點縮減為實際可用數。新授權不能修改pending/sending/unknown/sent槽或覆蓋其既有job；符合可重辦狀態的槽重新綁定模板時增加generation。舊已授權槽可以在完整新批次授權後重新綁定，不能假借舊primary權限去發別模板。

v1本機操作先按原requestId恢復，不能覆寫成batch或丟失adFinished。新操作可擴展儲存schema，但保留解析v1與destroy後遲到回應不能覆寫新操作的保護；回前景僅恢復已發起的服務端操作，不自動彈微信授權或廣告。廣告已完整但網路未知，必須保存同場權益並重放同requestId。

新版controller提供toggle(occurrence)及refresh/destroy/isChecked，原生Toast透過頁面通知回調。配置／清單載入期間禁點；開通不得先await prepare再調原生授權。取消走原版本檢查，不拉起新授權／廣告。既有流行詳情仍存在且有同一開關，移除的只是提醒設定面板。

## 驗收

本地真service/repo/worker及runtime/controller整合覆蓋舊pending可發、新三job各自模板與字段、取消／未知不重發、一次原生呼叫先於任何await服務、拒絕不播廣告、一次完整廣告三job、免重看與中斷恢復。UI三處按鈕不開自建面板，原生日程詳情保留；實測截圖及HTML。真模板、真Timer、phone授權／廣告／接收分層如實標示。
