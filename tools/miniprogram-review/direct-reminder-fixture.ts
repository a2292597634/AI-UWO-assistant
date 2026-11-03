/** 獨立固定腳本，避免其他場景帶入免廣告邏輯而超過 Windows 命令列長度。 */
export const DIRECT_REMINDER_FIXTURE_SOURCE = `function () {
  var name = 'major-event-reminder-direct';
  if (!wx.cloud || typeof wx.cloud.callFunction !== 'function' || wx.__uwoReviewFixture) throw new Error('fixture 前置條件不符');
  var saved = [], wrappers = [], sub = null, operation = null;
  var marker = { name: name, saved: saved, wrappers: wrappers };
  wx.__uwoReviewFixture = marker;
  if (wx.__uwoReviewFixture !== marker) throw new Error('fixture marker 安裝失敗');
  function replace(target, key, fn) { saved.push([target,key,target[key]]); target[key]=fn; wrappers.push([target,key,fn]); if(target[key]!==fn) throw new Error('fixture API 安裝失敗：'+key); }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  var templates = [10800,3600,600].map(function(lead,i) { return {leadSeconds:lead,templateId:'fixture-direct-'+i,title:'離線提醒'+i}; });
  replace(Date,'now',function() { return 1793635260000; });
  replace(wx.cloud,'callFunction',function(input) {
    input=input||{}; var d=input.data||{}, a=d.action, data=null;
    if(input.name==='major-event-reminder') {
      if(a==='getBatchConfig') data={enabled:true,reason:null,adUnitId:'adunit-offline-unused',templates:templates};
      else if(a==='list') data={subscriptions:sub?[sub]:[]};
      else if(a==='prepareBatch') {
        var o=d.occurrence, now=Math.floor(Date.now()/1000);
        sub={key:[o.zoneId,o.eventTypeId,o.triggerAtUnixSeconds].join(':'),version:1,adCompleted:false,slots:templates.map(function(t){var due=o.triggerAtUnixSeconds-t.leadSeconds;return {leadSeconds:t.leadSeconds,dueAtUnixSeconds:due,status:due>now?'unsubscribed':'missed'};})};
        data={sessionId:'fixture-direct-session',subscription:sub};
      } else if(a==='authorizeBatch' && sub && d.sessionId==='fixture-direct-session') {
        sub.slots.forEach(function(s,i){if(s.dueAtUnixSeconds>Date.now()/1000 && d.templateIds.indexOf(templates[i].templateId)>=0)s.status='authorized';});
        sub.version++; data={subscription:sub};
      } else if(a==='activateAuthorized' && sub && d.sessionId==='fixture-direct-session') {
        sub.slots.forEach(function(s){if(s.status==='authorized' && s.dueAtUnixSeconds>Date.now()/1000)s.status='pending';});
        sub.version++; data={subscription:sub};
      } else if(a==='cancel' && sub && d.key===sub.key) {
        sub.slots.forEach(function(s){if(s.status==='pending')s.status='cancelled';}); sub.version++; data={subscription:sub};
      }
    }
    var response=data?{result:{ok:true,data:clone(data)}}:{result:{ok:false,code:'unknown-action',message:'離線驗收不支持此操作'}};
    if(input.success)input.success(response); if(input.complete)input.complete(response); return Promise.resolve(response);
  });
  var read=wx.getStorageSync, write=wx.setStorageSync;
  replace(wx,'getStorageSync',function(key){return key==='major_event_reminder_operation_v1'?clone(operation):read.call(wx,key);});
  replace(wx,'setStorageSync',function(key,value){if(key==='major_event_reminder_operation_v1')operation=clone(value);else return write.call(wx,key,value);});
  replace(wx,'requestSubscribeMessage',function(input){var result={};input.tmplIds.forEach(function(id){result[id]='accept';});if(input.success)input.success(result);return Promise.resolve(result);});
  replace(wx,'createRewardedVideoAd',function(){throw new Error('免廣告離線驗收禁止建立廣告');});
  return wrappers.every(function(x){return x[0][x[1]]===x[2];})?'uwo-review-fixture:'+name:null;
}`
