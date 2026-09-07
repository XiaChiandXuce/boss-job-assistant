const {test} = require('node:test');
const assert = require('node:assert/strict');
const {background} = require('./harness.cjs');
const start={type:'START',settings:{max:5},jobs:[{url:'/job_detail/j1.html',title:'工程师'}]};
test('同时点击开始只创建一个任务和工作标签',async()=>{
  const bg=background();
  const responses=await Promise.all([bg.post(start),bg.post(start)]);
  assert.equal(responses.filter(r=>r.ok).length,1);assert.equal(bg.tabs.size,1);
});
test('写入打招呼意图后，重复请求和其他标签不能再次点击',async()=>{
  const bg=background();await bg.post(start);const r=bg.run();
  const msg={type:'STEP',runId:r.id,jobId:'j1',from:'open_job',to:'greeting_started'};
  assert.ok((await bg.post(msg,999,'https://www.zhipin.com/job_detail/j1.html')).error);
  assert.ok((await bg.post(msg,r.workerTabId,'https://www.zhipin.com/job_detail/other.html')).error);
  assert.equal((await bg.post(msg,r.workerTabId,'https://www.zhipin.com/job_detail/j1.html')).ok,true);
  assert.equal((await bg.post(msg,r.workerTabId,'https://www.zhipin.com/job_detail/j1.html')).ok,false);
  assert.equal(bg.history().j1.status,'greeting_started');
});
test('暂停阻止下一步，结果不能提前记为附件已发送',async()=>{
  const bg=background();await bg.post(start);const r=bg.run();
  await bg.post({type:'PAUSE',runId:r.id});
  assert.equal((await bg.post({type:'STEP',runId:r.id,jobId:'j1',from:'open_job',to:'greeting_started'},r.workerTabId,'https://www.zhipin.com/job_detail/j1.html')).ok,false);
  const result=await bg.post({type:'FINISH',runId:r.id,jobId:'j1',phase:'open_job',result:'sent'},r.workerTabId,'https://www.zhipin.com/job_detail/j1.html');
  assert.ok(result.error);assert.equal(bg.run().results.length,0);
});
test('停止后重新开始会跳过发送状态不确定的历史岗位',async()=>{
  const bg=background();await bg.post(start);const r=bg.run();
  await bg.post({type:'STEP',runId:r.id,jobId:'j1',from:'open_job',to:'greeting_started'},r.workerTabId,'https://www.zhipin.com/job_detail/j1.html');
  await bg.post({type:'STOP',runId:r.id});
  assert.ok((await bg.post(start)).error);
  assert.equal(bg.tabs.size,1);
});

test('后台拒绝提前超时、暂停期间超时和过期的发送步骤',async()=>{
  const bg=background();await bg.post(start);const r=bg.run();
  const post=msg=>bg.post({runId:r.id,jobId:'j1',...msg},r.workerTabId,'https://www.zhipin.com/job_detail/j1.html');
  await post({type:'STEP',from:'open_job',to:'greeting_started'});
  const finish={type:'FINISH',phase:'greeting_started',result:'timed_out',note:'等待超时'};
  assert.equal((await post(finish)).ok,false);
  await bg.post({type:'PAUSE',runId:r.id});bg.advance(20000);
  assert.equal((await post(finish)).ok,false);assert.equal(bg.run().index,0);
  await bg.post({type:'RESUME',runId:r.id});bg.advance(10000);
  assert.equal((await post({type:'STEP',from:'greeting_started',to:'open_chat'})).ok,false);
  assert.equal((await post(finish)).ok,true);assert.equal(bg.run().results.length,1);
});
