(function () {
  'use strict';
  if (document.getElementById('boss-two-step')) return;
  const C = BossTwoStepCore, A = BossTwoStepAdapter;
  let snapshot = null, busy = false, localPaused = false, selected = null;
  const host = document.createElement('aside');
  host.id = 'boss-two-step';
  const ui = host.attachShadow({mode:'open'});
  ui.innerHTML = `
    <style>
      :host{all:initial;position:fixed;right:20px;bottom:20px;z-index:2147483647;font:14px/1.5 system-ui,"Microsoft YaHei",sans-serif;color:#193532}
      *{box-sizing:border-box} .panel{width:310px;max-width:calc(100vw - 32px);max-height:calc(100vh - 40px);overflow:auto;background:white;border:1px solid #d0e4de;border-radius:16px;box-shadow:0 8px 35px #13352c24;padding:18px}
      header{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px}strong{font-size:19px;letter-spacing:.2px}
      button,input{font:inherit}button{cursor:pointer;border:1px solid #c8dcd7;border-radius:8px;padding:9px 12px;background:#fff;color:#193532}
      button:hover{background:#eff7f4}button:focus-visible,input:focus-visible{outline:3px solid #70cabb;outline-offset:2px}button:disabled{cursor:default;opacity:.5}
      .primary{background:#087f71;border-color:#087f71;color:white;font-weight:600}.primary:hover{background:#066b5f}.muted{font-size:12px;color:#657b76;margin:4px 0 14px}
      label{display:block;font-size:12px;margin:12px 0 5px}input{width:100%;padding:9px;border:1px solid #c8dcd7;border-radius:7px;background:white;color:#193532}
      .row{display:flex;gap:7px;margin-top:14px}.row button{flex:1}#collapse{border:0;padding:1px 7px;font-size:20px}
      #status{background:#eff7f4;border-radius:8px;padding:10px;margin-top:14px;font-size:13px;overflow-wrap:anywhere}#log{margin:10px 0 0;padding:0;list-style:none;max-height:145px;overflow:auto;font-size:12px;color:#526d66}li{padding:4px 0;border-bottom:1px solid #eef3f0}
      #error{color:#a13e20;font-size:12px;margin-top:8px;overflow-wrap:anywhere}#skip{width:100%;margin-top:7px;font-size:12px}#mini{display:none;background:#087f71;color:white;border-radius:24px;padding:12px 18px}.hidden{display:none!important}
    </style>
    <button id="mini">两步助手</button>
    <section class="panel" aria-label="BOSS 两步助手">
      <header><strong>打招呼 → 发简历</strong><button id="collapse" aria-label="收起助手">−</button></header>
      <p class="muted">使用 BOSS 自带招呼语和已上传的附件。</p>
      <label for="max">本次处理前几个岗位</label><input id="max" type="number" min="1" max="50" value="5">
      <label for="interval">岗位间隔（秒）</label><input id="interval" type="number" min="1" max="600" step="1" value="10" aria-describedby="interval-help">
      <p id="interval-help" class="muted">从打招呼起计时，到时还不能发附件就自动下一个。暂停后可修改。</p>
      <label for="resume">附件文件名（只有一份可留空）</label><input id="resume" placeholder="例如：我的简历.pdf" maxlength="200">
      <div class="row"><button id="start" class="primary">开始这页</button><button id="pause" disabled>暂停</button><button id="stop" disabled>停止</button></div>
      <button id="skip" class="hidden">跳过当前岗位，继续下一个</button>
      <div id="status" role="status" aria-live="polite">先在 BOSS 职位页选好岗位范围。</div>
      <div id="error" role="alert"></div><ol id="log" aria-label="操作记录"></ol>
    </section>`;
  document.documentElement.append(host);
  const el = id => ui.getElementById(id);
  const error = message => { el('error').textContent = message; };
  const rpc = async payload => {
    const response = await chrome.runtime.sendMessage(payload);
    if (response?.error) throw Error(response.error);
    return response;
  };
  const options = () => C.settings({max:el('max').value, resumeName:el('resume').value, intervalSeconds:el('interval').value});
  function show() { ui.querySelector('.panel').classList.remove('hidden'); el('mini').style.display = 'none'; }
  el('collapse').onclick = () => { ui.querySelector('.panel').classList.add('hidden'); el('mini').style.display = 'block'; };
  el('mini').onclick = show;
  chrome.runtime.onMessage.addListener(msg => { if (msg.type === 'SHOW') show(); });
  async function control(type) {
    try {
      error('');
      if (type === 'PAUSE' || type === 'STOP') localPaused = true;
      await rpc({type, runId:snapshot?.run?.id, ...(type === 'RESUME' ? {settings:options()} : {})});
      if (type === 'RESUME' || type === 'SKIP') localPaused = false;
      await refresh();
    } catch (e) { error(e.message); }
    finally { localPaused = false; }
  }
  el('start').onclick = async () => {
    try {
      error('');
      if (!/^\/web\/geek\/jobs?\/?$/.test(location.pathname) && !C.jobURL(location.href)) throw Error('请先打开 BOSS 的“职位”页，再点开始');
      const issue = A.block(document); if (issue) throw Error(issue);
      el('start').disabled = true;
      await rpc({type:'START', jobs:A.jobs(document), settings:options()});
      localPaused = false;
      await refresh();
    } catch (e) { error(e.message); el('start').disabled = false; }
  };
  el('pause').onclick = () => control(snapshot?.run?.status === 'paused' ? 'RESUME' : 'PAUSE');
  el('stop').onclick = () => control('STOP');
  el('skip').onclick = () => control('SKIP');
  function render(data) {
    const run = data.run;
    const active = run && ['running','paused'].includes(run.status);
    el('start').disabled = !!active;
    el('pause').disabled = !active; el('stop').disabled = !active;
    el('pause').textContent = run?.status === 'paused' ? '继续' : '暂停';
    el('max').disabled = !!active;
    el('resume').disabled = run?.status === 'running';
    el('interval').disabled = run?.status === 'running';
    el('skip').classList.toggle('hidden', run?.status !== 'paused');
    if (!run) return;
    const sent = run.results.filter(item => item.result === 'sent').length;
    const waiting = run.results.filter(item => ['unavailable','timed_out'].includes(item.result)).length;
    const state = {running:'运行中',paused:'已暂停',stopped:'已停止',done:'已完成'}[run.status];
    let countdown = '';
    if (active) {
      const now = run.status === 'paused' ? (run.pausedAt ?? Date.now()) : Date.now();
      if (C.waitingForResume(run)) countdown = ` · 最多再等 ${Math.max(0,Math.ceil((C.deadline(run)-now)/1000))} 秒`;
      if (run.phase === 'between') countdown = ` · ${Math.max(0,Math.ceil((run.nextAt-now)/1000))} 秒后下一个`;
      if (run.phase === 'resume_sending') countdown = ' · 正在核验附件发送结果';
    }
    el('status').textContent = `${state} · 已处理 ${run.index}/${run.jobs.length} · 附件已发 ${sent} · 等待后跳过 ${waiting}${countdown}`;
    const logs = run.logs.slice(-6).map(item => {
      const li = document.createElement('li');
      li.textContent = `${new Date(item.time).toLocaleTimeString('zh-CN',{hour12:false})} ${item.message}`;
      return li;
    });
    el('log').replaceChildren(...logs);
  }
  let configured = false;
  async function refresh() {
    const data = await rpc({type:'GET'});
    snapshot = data;
    if (!configured) {
      el('max').value = data.settings.max; el('resume').value = data.settings.resumeName;
      el('interval').value = data.settings.intervalSeconds;
      configured = true;
    }
    if (data.run?.status === 'running') el('interval').value = data.run.settings.intervalSeconds ?? 10;
    render(data);
    return data;
  }
  function request(run, type, more = {}) {
    return rpc({type, runId:run.id, jobId:run.jobs[run.index]?.id, phase:run.phase, ...more});
  }
  async function issue(run, message) { await request(run, 'ISSUE', {message}); }
  async function step(run, to, extra = {}) { return (await request(run, 'STEP', {from:run.phase, to, ...extra})).ok; }
  async function permitted(run, phase) {
    const now = await rpc({type:'GET'});
    return !localPaused && now.isWorker && now.run?.id === run.id && now.run.status === 'running' &&
      now.run.index === run.index && now.run.phase === phase &&
      (!C.waitingForResume(now.run) || Date.now() < C.deadline(now.run));
  }
  function click(node) {
    node.scrollIntoView({block:'center',behavior:'instant'});
    if (node.tagName === 'A') node.setAttribute('target','_self');
    node.click();
  }
  async function drive(run) {
    const job = run.jobs[run.index];
    if (!job || run.phase === 'between') return;
    const blocked = A.block(document);
    if (blocked) return issue(run, blocked);
    const age = Date.now() - run.phaseAt;
    if (C.waitingForResume(run) && Date.now() >= C.deadline(run)) {
      const reason = !A.isChat(document) ? '会话未就绪' : !A.chatMatches(document,job) ? '无法核对目标会话' : '尚未能发送附件';
      return request(run,'FINISH',{result:'timed_out',note:`等待 ${run.settings.intervalSeconds ?? 10} 秒，${reason}，未发附件，已自动跳过`});
    }
    if (run.phase === 'open_job') {
      if (C.jobURL(location.href)?.id !== job.id) {
        if (age > 20000) await issue(run, '未打开目标岗位。请检查工作标签页；可以跳过此岗位。');
        return;
      }
      const greet = A.greetButton(document);
      if (!greet && A.continueButton(document)) return request(run, 'FINISH', {result:'already_contacted', note:'页面显示已经沟通过，已跳过'});
      if (!greet || A.disabled(greet)) {
        if (age > 20000) await issue(run, '未找到可用的“立即沟通”按钮，可能岗位已下线或页面结构有变化');
        return;
      }
      if (await step(run, 'greeting_started', {detail:A.detail(document)}) && await permitted(run,'greeting_started')) click(greet);
      return;
    }
    if (run.phase === 'greeting_started') {
      if (A.isChat(document)) {
        if (!A.chatMatches(document, job)) {
          return;
        }
        await step(run,'open_chat');
        return;
      }
      const next = A.continueButton(document);
      if (next && !A.disabled(next) && !run.navigated) {
        if ((await request(run,'NAVIGATE_CHAT')).ok && await permitted(run,'greeting_started')) click(next);
        return;
      }
      return;
    }
    if (!A.isChat(document) || !A.chatMatches(document,job)) {
      if (run.phase === 'resume_sending' && age > 20000) await issue(run,'发送后无法核对目标会话，请手动核对附件是否送达；程序不会自动重发。');
      return;
    }
    if (run.phase === 'open_chat') {
      const resume = A.resumeButton(document);
      const notice = A.resumeNotice(document);
      if (notice || !resume || A.disabled(resume)) return;
      if (await step(run,'resume_opening') && await permitted(run,'resume_opening')) click(resume);
      return;
    }
    if (run.phase === 'resume_opening') {
      const notice = A.resumeNotice(document);
      if (notice) return;
      if (A.resumes(document) !== null) { await step(run,'resume_ready'); return; }
      return;
    }
    if (run.phase === 'resume_ready') {
      const items = A.resumes(document);
      if (!items) return;
      const choice = C.chooseResume(items,run.settings.resumeName);
      if (selected !== choice.el) {
        if (!await permitted(run,'resume_ready')) return;
        click(choice.el); selected = choice.el;
        return;
      }
      const confirm = A.confirmResume(document);
      if (!confirm || A.disabled(confirm)) return;
      const checked = items.filter(item => item.el.matches('.active,.selected,.checked,[aria-checked="true"]') || item.el.querySelector('input:checked,[aria-checked="true"],.radio-checked'));
      if (checked.length && (checked.length !== 1 || checked[0].el !== choice.el)) return issue(run,'选中的附件发生变化，请检查文件名后继续');
      if (!checked.length && items.length > 1) return issue(run,'无法确认多份附件中哪份已选中，已暂停');
      const baseline = A.attachmentEvidence(document,choice.name);
      if (await step(run,'resume_sending',{name:choice.name,baseline}) && await permitted(run,'resume_sending')) click(confirm);
      return;
    }
    if (run.phase === 'resume_sending') {
      if (A.hasNewAttachment(document,run.selectedResume,run.baseline)) return request(run,'FINISH',{result:'sent',note:`附件已出现在当前会话：${run.selectedResume}`});
      if (age > 20000) await issue(run,'已点击发送，但未识别到新增附件。请核对会话；程序不会自动重发。');
    }
  }
  async function tick() {
    if (busy) return;
    busy = true;
    try {
      const data = await refresh();
      if (data.run?.status === 'running' && data.isWorker && !localPaused) await drive(data.run);
    } catch (e) {
      error(e.message);
      if (snapshot?.isWorker && snapshot.run?.status === 'running') {
        try { await issue(snapshot.run,e.message); } catch {}
      }
    } finally { busy = false; }
  }
  setInterval(tick,1000);
  tick();
})();
