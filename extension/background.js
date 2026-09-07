'use strict';
importScripts('core.js');
const C = BossTwoStepCore;
let chain = Promise.resolve();
const serial = fn => { const result = chain.then(fn); chain = result.catch(() => {}); return result; };
const load = async () => (await chrome.storage.session.get('run')).run || null;
const save = async run => chrome.storage.session.set({run});
const stamp = () => new Date().toISOString();
function log(run, message) { run.logs.push({time: stamp(), message}); run.logs = run.logs.slice(-100); }
function current(run) { return run?.jobs[run.index]; }
function boss(url) { try { return new URL(url).origin === 'https://www.zhipin.com'; } catch { return false; } }
async function remember(job, status) {
  const {history = {}} = await chrome.storage.local.get('history');
  history[job.id] = {status, title: job.title, at: stamp()};
  await chrome.storage.local.set({history});
}
async function openCurrent(run) {
  const job = current(run);
  if (!job) { run.status = 'done'; log(run, '本批处理完毕'); await save(run); return; }
  run.phase = 'open_job'; run.phaseAt = Date.now(); run.navigated = false;
  run.selectedResume = ''; run.baseline = []; run.greetingAt = null; run.pausedAt = null;
  log(run, `准备：${job.title || job.id}`);
  await save(run);
  let tab;
  if (run.workerTabId) {
    try { tab = await chrome.tabs.update(run.workerTabId, {url: job.url, active: true}); } catch {}
  }
  if (!tab) tab = await chrome.tabs.create({url: job.url, active: true});
  run.workerTabId = tab.id;
  await save(run);
}
async function finish(run, result, note) {
  const job = current(run);
  run.results.push({id: job.id, title: job.title, result, note});
  await remember(job, result);
  log(run, `${job.title || job.id}：${note}`);
  run.index += 1;
  // A fast send still observes the interval; a timeout adds no second delay.
  run.nextAt = Math.max(Date.now(), C.deadline(run) ?? Date.now());
  run.phase = 'between'; run.phaseAt = Date.now();
  if (run.index >= run.jobs.length) { run.status = 'done'; log(run, '本批处理完毕'); }
  await save(run);
}
async function route(msg, sender) {
  if (!sender.tab || !boss(sender.url || sender.tab.url)) throw Error('仅支持 BOSS 直聘网页');
  let run = await load();
  if (msg.type === 'GET') {
    if (run?.status === 'running' && run.phase === 'between' && Date.now() >= run.nextAt) await openCurrent(run);
    const {settings = {}} = await chrome.storage.local.get('settings');
    return {run, settings: C.settings(settings), isWorker: run?.workerTabId === sender.tab.id};
  }
  if (msg.type === 'START') {
    if (run && ['running','paused'].includes(run.status)) throw Error('已有任务，请继续或停止当前任务');
    const settings = C.settings(msg.settings);
    const {history = {}} = await chrome.storage.local.get('history');
    const jobs = C.queue(msg.jobs, history, settings.max);
    if (!jobs.length) throw Error('没有未处理的岗位。请回到职位列表，加载岗位后再开始；已有记录的岗位会跳过。');
    run = {id: crypto.randomUUID(), status: 'running', phase: 'open_job', index: 0, jobs, settings,
      sourceTabId: sender.tab.id, workerTabId: null, logs: [], results: [], phaseAt: Date.now()};
    await chrome.storage.local.set({settings});
    await openCurrent(run);
    return {ok: true};
  }
  if (!run || msg.runId !== run.id) throw Error('任务已改变，请刷新助手面板');
  if (msg.type === 'STOP') {
    run.status = 'stopped'; log(run, '已停止。已发出的操作不会撤回。'); await save(run); return {ok: true};
  }
  if (msg.type === 'PAUSE') {
    if (run.status === 'running') { run.status = 'paused'; run.pausedAt = Date.now(); log(run, '已暂停，倒计时已冻结'); await save(run); }
    return {ok: true};
  }
  if (msg.type === 'RESUME') {
    if (run.status !== 'paused') throw Error('当前任务没有暂停');
    run.settings = C.settings(msg.settings || run.settings);
    await chrome.storage.local.set({settings: run.settings});
    const startedAt = run.greetingAt ?? (C.waitingForResume(run) ? run.phaseAt : null);
    if (startedAt != null) run.greetingAt = startedAt + Math.max(0, Date.now() - (run.pausedAt ?? Date.now()));
    run.pausedAt = null;
    if (run.phase === 'between') run.nextAt = Math.max(Date.now(), C.deadline(run) ?? Date.now());
    run.status = 'running'; run.phaseAt = Date.now(); log(run, `继续处理，岗位间隔 ${run.settings.intervalSeconds} 秒`); await save(run);
    return {ok: true};
  }
  if (msg.type === 'SKIP') {
    if (run.status !== 'paused') throw Error('请先暂停');
    await finish(run, 'manual_skip', '已手动跳过，发送情况请在会话核对');
    if (run.status !== 'done') { run.status = 'running'; await openCurrent(run); }
    return {ok: true};
  }
  if (sender.tab.id !== run.workerTabId || msg.jobId !== current(run)?.id) throw Error('当前页面不是任务正在处理的岗位');
  if (msg.type === 'ISSUE') {
    if (run.status === 'running') { run.status = 'paused'; run.pausedAt = Date.now(); log(run, String(msg.message).slice(0, 250)); await save(run); }
    return {ok: true};
  }
  if (msg.type === 'FINISH') {
    if (!['running','paused'].includes(run.status) || msg.phase !== run.phase) return {ok: false};
    const allowed = {already_contacted: ['open_job'], unavailable: ['open_chat','resume_opening','resume_ready'],
      timed_out: ['greeting_started','open_chat','resume_opening','resume_ready'], sent: ['resume_sending']};
    if (!allowed[msg.result]?.includes(run.phase)) throw Error('结果与执行步骤不符');
    if (msg.result === 'timed_out' && (run.status !== 'running' || Date.now() < C.deadline(run))) return {ok: false};
    await finish(run, msg.result, String(msg.note).slice(0, 200));
    return {ok: true};
  }
  if (msg.type === 'STEP') {
    if (run.status !== 'running' || run.phase !== msg.from) return {ok: false};
    const transitions = {open_job: 'greeting_started', greeting_started: 'open_chat', open_chat: 'resume_opening',
      resume_opening: 'resume_ready', resume_ready: 'resume_sending'};
    if (transitions[msg.from] !== msg.to) throw Error('执行顺序错误');
    if (C.waitingForResume(run) && Date.now() >= C.deadline(run)) return {ok: false};
    if (msg.from === 'open_job') {
      if (C.jobURL(sender.url)?.id !== current(run).id) throw Error('岗位页面与目标不一致');
      if (msg.detail?.title) current(run).title = C.normal(msg.detail.title).slice(0, 200);
      if (msg.detail?.company) current(run).company = C.normal(msg.detail.company).slice(0, 200);
      await remember(current(run), 'greeting_started');
      run.greetingAt = Date.now();
    }
    if (msg.to === 'resume_sending') {
      run.selectedResume = C.normal(msg.name);
      if (!run.selectedResume) throw Error('没有选定附件简历');
      run.baseline = Array.isArray(msg.baseline) ? msg.baseline.slice(-300).map(String) : [];
      await remember(current(run), 'resume_sending');
    }
    run.phase = msg.to; run.phaseAt = Date.now();
    log(run, {greeting_started:'正在点击立即沟通', open_chat:'已进入目标会话', resume_opening:'正在打开附件简历',
      resume_ready:'正在选择附件简历', resume_sending:`正在发送附件：${run.selectedResume}`}[msg.to]);
    await save(run);
    return {ok: true};
  }
  if (msg.type === 'NAVIGATE_CHAT') {
    if (run.status !== 'running' || run.phase !== 'greeting_started' || run.navigated) return {ok: false};
    run.navigated = true; await save(run); return {ok: true};
  }
  throw Error('未知操作');
}
chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  serial(() => route(msg, sender)).then(value => respond(value), error => respond({error: error.message}));
  return true;
});
// The site may open the newly initiated conversation in another tab.
chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
  if (!change.url || !boss(change.url) || !/\/web\/geek\/chat/.test(change.url)) return;
  serial(async () => {
    const run = await load();
    if (run?.status === 'running' && run.phase === 'greeting_started' && tab.openerTabId === run.workerTabId) {
      run.workerTabId = tabId; await save(run);
    }
  }).catch(() => {});
});
chrome.tabs.onRemoved.addListener(tabId => {
  serial(async () => {
    const run = await load();
    if (run && run.workerTabId === tabId && ['running','paused'].includes(run.status)) {
      run.status = 'stopped'; log(run, '工作标签页已关闭，任务已停止'); await save(run);
    }
  }).catch(() => {});
});
chrome.action.onClicked.addListener(tab => {
  if (boss(tab.url)) chrome.tabs.sendMessage(tab.id, {type:'SHOW'}).catch(() => {});
  else chrome.tabs.create({url:'https://www.zhipin.com/web/geek/jobs'});
});
