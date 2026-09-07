const {test} = require('node:test');
const assert = require('node:assert/strict');
const {background,page,content} = require('./harness.cjs');
async function setup({disabled=false,wrongChat=false,missingResult=false,multiple=false,jobs=1,intervalSeconds=10}={}) {
  const bg=background();
  await bg.post({type:'START',settings:{max:jobs,intervalSeconds},jobs:Array.from({length:jobs},(_,i)=>({url:`/job_detail/j${i+1}.html`,title:'工程师',company:'示例公司'}))});
  const run=bg.run(),counts={greet:0,resume:0};
  const dom=page('<main><div class="job-banner"><h1>工程师</h1><a class="btn-startchat">立即沟通</a></div><div class="sider-company"><span class="company-name">示例公司</span></div></main>');
  const doc=dom.window.document;
  doc.querySelector('.btn-startchat').onclick=()=>{
    counts.greet++;
    doc.querySelector('main').innerHTML=`<div class="position-content"><a href="/job_detail/${wrongChat?'wrong':'j1'}.html"><span class="position-name">工程师</span></a>示例公司</div>
      <div class="chat-message"><ul class="im-list"></ul></div><div class="toolbar-btn ${disabled?'unable':''}">发简历</div>`;
    doc.querySelector('.toolbar-btn').onclick=()=>{
      const modal=doc.createElement('div');modal.className='dialog-wrap';
      modal.innerHTML=`<ul class="resume-list"><li class="list-item"><span class="resume-name">我的简历.pdf</span></li>${multiple?'<li class="list-item"><span class="resume-name">其他.pdf</span></li>':''}</ul><button disabled>发送</button>`;
      doc.querySelector('main').append(modal);
      for(const item of modal.querySelectorAll('li'))item.onclick=()=>{for(const row of modal.querySelectorAll('li'))row.classList.remove('active');item.classList.add('active');modal.querySelector('button').disabled=false;};
      modal.querySelector('button').onclick=()=>{
        counts.resume++;
        if(!missingResult)doc.querySelector('.im-list').innerHTML='<li class="message-item item-my" data-id="new"><div class="resume-card">我的简历.pdf</div></li>';
        modal.remove();
      };
    };
  };
  const worker=await content(dom,bg,run.workerTabId);
  return {bg,dom,worker,counts};
}
test('完整两步：一次打招呼、选择附件、一次发送并核验新增消息',async()=>{
  const f=await setup();for(let i=0;i<12;i++)await f.worker.tick();
  assert.deepEqual(f.counts,{greet:1,resume:1});assert.equal(f.bg.run().status,'done');assert.equal(f.bg.run().results[0].result,'sent');
  f.dom.window.close();
});
test('平台禁止发简历时等待满 10 秒，再自动跳过且不记为已发送',async()=>{
  const f=await setup({disabled:true});for(let i=0;i<8;i++)await f.worker.tick();
  f.bg.advance(9000);await f.worker.tick();
  assert.equal(f.bg.run().results.length,0);assert.match(f.worker.ui.getElementById('status').textContent,/最多再等 1 秒/);
  f.bg.advance(1000);await f.worker.tick();
  assert.deepEqual(f.counts,{greet:1,resume:0});assert.equal(f.bg.run().results[0].result,'timed_out');assert.equal(f.bg.run().status,'done');f.dom.window.close();
});
test('切到其他岗位的会话时不会发送附件',async()=>{
  const f=await setup({wrongChat:true});for(let i=0;i<8;i++)await f.worker.tick();
  assert.deepEqual(f.counts,{greet:1,resume:0});assert.equal(f.bg.run().phase,'greeting_started');
  f.bg.advance(10000);await f.worker.tick();
  assert.equal(f.bg.run().status,'done');assert.match(f.bg.run().results[0].note,/无法核对目标会话/);assert.equal(f.counts.resume,0);f.dom.window.close();
});
test('发送后无回执，刷新工作页面不会重发',async()=>{
  const f=await setup({missingResult:true});for(let i=0;i<10;i++)await f.worker.tick();
  assert.deepEqual(f.counts,{greet:1,resume:1});assert.equal(f.bg.run().phase,'resume_sending');assert.equal(f.bg.run().results.length,0);
  f.dom.window.document.querySelector('#boss-two-step').remove();
  const again=await content(f.dom,f.bg,f.bg.run().workerTabId);for(let i=0;i<4;i++)await again.tick();
  f.bg.advance(10000);await again.tick();assert.equal(f.bg.run().phase,'resume_sending');assert.equal(f.bg.run().results.length,0);
  f.bg.advance(11000);await again.tick();assert.equal(f.bg.run().status,'paused');
  assert.deepEqual(f.counts,{greet:1,resume:1});f.dom.window.close();
});
test('多附件不猜文件名，填写后继续发送指定附件',async()=>{
  const f=await setup({multiple:true});for(let i=0;i<8;i++)await f.worker.tick();
  assert.equal(f.bg.run().status,'paused');assert.equal(f.counts.resume,0);
  f.worker.ui.getElementById('resume').value='我的简历.pdf';
  await f.worker.tick();await f.worker.ui.getElementById('pause').onclick();
  for(let i=0;i<8;i++)await f.worker.tick();
  assert.equal(f.bg.run().status,'done');assert.equal(f.counts.resume,1);f.dom.window.close();
});

test('等待期间发简历入口变为可用，会发送附件',async()=>{
  const f=await setup({disabled:true});await f.worker.tick();await f.worker.tick();
  f.bg.advance(4000);
  f.dom.window.document.querySelector('.toolbar-btn').classList.remove('unable');
  for(let i=0;i<7;i++){await f.worker.tick();f.bg.advance(500);}
  assert.equal(f.bg.run().results[0].result,'sent');assert.deepEqual(f.counts,{greet:1,resume:1});f.dom.window.close();
});

test('超时后无需手动操作即打开下一岗位并打招呼，无额外 5 秒延迟',async()=>{
  const f=await setup({disabled:true,jobs:2,intervalSeconds:10});await f.worker.tick();
  const workerId=f.bg.run().workerTabId;
  f.bg.advance(10000);await f.worker.tick();
  assert.equal(f.bg.run().index,1);assert.equal(f.bg.run().nextAt,f.bg.now());
  await f.worker.tick();assert.equal(f.bg.tabs.get(workerId).url,'https://www.zhipin.com/job_detail/j2.html');
  const next=page('<div class="job-banner"><h1>第二岗位</h1><a class="btn-startchat">立即沟通</a></div>','https://www.zhipin.com/job_detail/j2.html');
  let greetings=0;next.window.document.querySelector('a').onclick=()=>{greetings++;};
  await content(next,f.bg,workerId);
  assert.equal(greetings,1);assert.equal(f.bg.run().status,'running');assert.equal(f.bg.run().phase,'greeting_started');
  assert.equal(f.bg.run().greetingAt,f.bg.now());assert.deepEqual(f.counts,{greet:1,resume:0});
  f.dom.window.close();next.window.close();
});

test('提前发完简历也遵守打招呼间隔，自定义 30 秒并跨步骤计时',async()=>{
  const f=await setup({jobs:2,intervalSeconds:30});f.bg.advance(2000);
  for(let i=0;i<10;i++)await f.worker.tick();
  const run=f.bg.run();assert.equal(run.results[0].result,'sent');assert.equal(run.phase,'between');
  assert.equal(run.nextAt-run.greetingAt,30000);assert.equal(f.worker.ui.getElementById('interval').value,'30');
  f.bg.advance(27000);await f.worker.tick();assert.equal(f.bg.run().phase,'between');
  f.bg.advance(1000);await f.worker.tick();assert.equal(f.bg.run().phase,'open_job');
  f.dom.window.close();
});

test('暂停冻结等待时间，修改间隔后继续使用新值并保存',async()=>{
  const f=await setup({disabled:true});await f.worker.tick();f.bg.advance(4000);await f.worker.tick();
  await f.worker.ui.getElementById('pause').onclick();
  f.bg.advance(60000);await f.worker.tick();
  assert.equal(f.bg.run().status,'paused');assert.equal(f.bg.run().results.length,0);
  assert.match(f.worker.ui.getElementById('status').textContent,/最多再等 6 秒/);
  f.worker.ui.getElementById('interval').value='20';await f.worker.ui.getElementById('pause').onclick();
  f.bg.advance(15000);await f.worker.tick();assert.equal(f.bg.run().results.length,0);
  f.bg.advance(1000);await f.worker.tick();assert.equal(f.bg.run().results[0].result,'timed_out');
  assert.equal(f.bg.chrome.storage.local.values.settings.intervalSeconds,20);f.dom.window.close();
});

test('刷新页面保留原倒计时，不会重新打招呼',async()=>{
  const f=await setup({disabled:true});await f.worker.tick();f.bg.advance(8000);
  f.dom.window.document.querySelector('#boss-two-step').remove();
  const again=await content(f.dom,f.bg,f.bg.run().workerTabId);
  assert.match(again.ui.getElementById('status').textContent,/最多再等 2 秒/);
  f.bg.advance(2000);await again.tick();assert.equal(f.bg.run().status,'done');assert.equal(f.counts.greet,1);f.dom.window.close();
});

test('超时同时出现网页验证时优先暂停，不会继续下一个岗位',async()=>{
  const f=await setup({disabled:true,jobs:2});await f.worker.tick();
  const captcha=f.dom.window.document.createElement('iframe');captcha.src='https://www.zhipin.com/captcha';f.dom.window.document.body.append(captcha);
  f.bg.advance(10000);await f.worker.tick();
  assert.equal(f.bg.run().status,'paused');assert.equal(f.bg.run().index,0);assert.equal(f.counts.resume,0);f.dom.window.close();
});
