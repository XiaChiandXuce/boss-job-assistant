(function (root) {
  'use strict';
  const normal = value => String(value || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
  function jobURL(raw, base = 'https://www.zhipin.com/') {
    try {
      const u = new URL(raw, base);
      const m = u.pathname.match(/^\/job_detail\/([a-zA-Z0-9_-]+)\.html$/);
      if (u.origin !== 'https://www.zhipin.com' || !m || u.username || u.password) return null;
      return {id: m[1], url: u.href};
    } catch { return null; }
  }
  function settings(raw = {}) {
    const max = Number(raw.max ?? 5);
    if (!Number.isInteger(max) || max < 1 || max > 50) throw Error('本次数量请输入 1～50 的整数');
    const resumeName = normal(raw.resumeName);
    if (resumeName.length > 200) throw Error('简历名称太长');
    const intervalSeconds = Number(raw.intervalSeconds ?? 10);
    if (!Number.isInteger(intervalSeconds) || intervalSeconds < 1 || intervalSeconds > 600) throw Error('岗位间隔请输入 1～600 秒的整数');
    return {max, resumeName, intervalSeconds};
  }
  function waitingForResume(run) {
    return ['greeting_started','open_chat','resume_opening','resume_ready'].includes(run?.phase);
  }
  function deadline(run) {
    const startedAt = run.greetingAt ?? (waitingForResume(run) ? run.phaseAt : null);
    return startedAt == null ? null : startedAt + (run.settings.intervalSeconds ?? 10) * 1000;
  }
  function queue(items, history, max) {
    const seen = new Set();
    const jobs = [];
    for (const item of items || []) {
      const url = jobURL(item.url);
      if (!url || seen.has(url.id) || Object.hasOwn(history, url.id)) continue;
      seen.add(url.id);
      jobs.push({...url, title: normal(item.title).slice(0, 200), company: normal(item.company).slice(0, 200)});
      if (jobs.length >= max) break;
    }
    return jobs;
  }
  function chooseResume(items, requested) {
    const name = normal(requested);
    const matches = name ? items.filter(item => normal(item.name) === name) : items;
    if (!matches.length) throw Error(name ? `未找到附件“${name}”，请填写 BOSS 中显示的完整名称` : 'BOSS 中没有可发送的附件简历');
    if (matches.length !== 1) throw Error('有多份附件简历，请填写要发送的完整文件名后继续');
    return matches[0];
  }
  const api = {normal, jobURL, settings, waitingForResume, deadline, queue, chooseResume};
  root.BossTwoStepCore = api;
  if (typeof module !== 'undefined') module.exports = api;
})(globalThis);
