(function (root) {
  'use strict';
  const C = root.BossTwoStepCore;
  function visible(el) {
    if (!el || el.closest('#boss-two-step')) return false;
    const style = el.ownerDocument.defaultView.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && el.getClientRects().length > 0;
  }
  function all(scope, selector) { return [...scope.querySelectorAll(selector)].filter(visible); }
  function first(scope, selector) { return all(scope, selector)[0] || null; }
  function text(el) { return C.normal(el?.textContent); }
  function disabled(el) {
    return !el || !!el.disabled || el.getAttribute('aria-disabled') === 'true' ||
      !!el.closest('.unable, .disabled, [aria-disabled="true"]');
  }
  function buttons(scope, labels, selector = 'button,a,[role="button"],.toolbar-btn') {
    return all(scope, selector).filter(el => labels.includes(text(el)));
  }
  function unique(elements, label) {
    // Nested labels may represent a single button. Keep the outer clickable element.
    const list = elements.filter(el => !elements.some(other => other !== el && other.contains(el)));
    if (list.length > 1) throw Error(`页面出现多个“${label}”入口，已暂停`);
    return list[0] || null;
  }
  function jobs(doc) {
    const rows = all(doc, 'li.job-card-box,li[class*="job-card"],div.job-card-box,div.job-card-wrapper');
    const result = [];
    for (const row of rows) {
      const links = [...row.querySelectorAll('a[href]')].map(a => C.jobURL(a.href)).filter(Boolean);
      const ids = new Set(links.map(a => a.id));
      if (ids.size !== 1) continue;
      result.push({...links[0],
        title: text(first(row, '.job-name,.position-name,[class*="job-name"]')),
        company: text(first(row, '.company-name,.boss-name,[class*="company-name"]'))});
    }
    if (!result.length) {
      for (const a of all(doc, 'a[href*="/job_detail/"]')) {
        const url = C.jobURL(a.href);
        if (!url || !text(a)) continue;
        result.push({...url, title: text(a), company: ''});
      }
    }
    const current = C.jobURL(doc.location.href);
    if (current) return [{...current, ...detail(doc)}];
    return result;
  }
  function detail(doc) {
    const banner = first(doc, '.job-banner,.job-detail-box,.job-detail-container,.job-detail');
    return {
      title: text(first(banner || doc, 'h1,.job-name,.job-title,.position-name')),
      company: text(first(doc, '.sider-company .company-name,.company-info .company-name,.job-detail .company-name,.job-detail-box .company-name'))
    };
  }
  function block(doc) {
    if (first(doc, 'iframe[src*="captcha"],iframe[src*="verify"],.geetest_panel,.geetest_panel_box,.verify-dialog,.captcha-container')) return 'BOSS 要求安全验证，请在网页中手动完成';
    const notices = all(doc, '[role="dialog"],.dialog-wrap,.dialog-container,.boss-popup,.toast,.toast-content,.message-box,.tip-text');
    for (const item of notices) {
      const value = text(item);
      if (/操作.*频繁|沟通.*上限|今日.*上限|明日再试|账号.*异常|访问.*异常|安全验证|验证码/.test(value)) return `BOSS 提示：${value.slice(0, 120)}`;
      if (/扫码登录|登录后继续|登录后.*沟通/.test(value)) return '请先在 BOSS 网页完成登录';
    }
    if (/\/web\/user\/|\/login|\/captcha|\/verify/.test(doc.location.pathname)) return '当前是登录或验证页面，请手动处理';
    return '';
  }
  function greetButton(doc) {
    return unique(buttons(doc, ['立即沟通','立即聊天'], '.op-btn-chat,.btn-startchat,button,a,[role="button"]'), '立即沟通');
  }
  function continueButton(doc) {
    const dialog = first(doc, '[role="dialog"],.dialog-wrap,.dialog-container,.boss-popup,.greet-boss-dialog');
    const labels = ['继续沟通','去沟通','前往沟通','去聊天'];
    const inDialog = dialog && unique(buttons(dialog, labels), '继续沟通');
    return inDialog || unique(buttons(doc, ['继续沟通'], '.op-btn-chat,.btn-startchat,a,button'), '继续沟通');
  }
  function isChat(doc) { return !!first(doc, '.chat-message,#chat-input,.chat-conversation .im-list'); }
  function chatMatches(doc, job) {
    const scopes = all(doc, '.position-content,.chat-position,.chat-info,.chat-header,.chat-conversation-header');
    const knownIds = scopes.flatMap(scope => [...scope.querySelectorAll('a[href]')].map(a => C.jobURL(a.href)?.id).filter(Boolean));
    if (knownIds.length) return new Set(knownIds).size === 1 && knownIds[0] === job.id;
    for (const scope of scopes) {
      const names = all(scope, '.position-name,.job-name,.job-title');
      if (job.title && job.company && names.some(el => text(el) === C.normal(job.title)) && text(scope).includes(C.normal(job.company))) return true;
    }
    return false;
  }
  function resumeButton(doc) {
    return unique(buttons(doc, ['发简历','发送简历'], '.toolbar-btn,button,[role="button"],.btn-resume'), '发简历');
  }
  function resumes(doc) {
    const list = first(doc, '.resume-list');
    if (!list) return null;
    return all(list, 'li.list-item,li.resume-item,.resume-item,[role="radio"]').map(el => ({
      el, name: text(first(el, '.resume-name,.file-name')) || text(el.querySelector('[title]')) || text(el)
    }));
  }
  function confirmResume(doc) {
    const list = first(doc, '.resume-list');
    if (!list) return null;
    const scope = list.closest('[role="dialog"],.dialog-wrap,.dialog-container,.boss-popup,.resume-dialog') || list.parentElement?.parentElement;
    if (!scope || scope === doc.body) return null;
    return unique(buttons(scope, ['发送','确认发送','确定','确认'], 'button,a[role="button"],.btn-confirm'), '发送简历确认');
  }
  function attachmentEvidence(doc, name) {
    const rows = all(doc, '.chat-message .item-my,.chat-message .item-self,.chat-message .message-item.is-self');
    return rows.filter(row => {
      if (row.matches('[data-status="failed"],[data-status="pending"]') || row.querySelector('.send-fail,.send-error,.icon-fail,.send-loading,[data-status="failed"],[data-status="pending"]')) return false;
      const file = row.querySelector('.resume-card,.resume-name,.file-name,[class*="resume"],[class*="file-card"]');
      return file && text(row).includes(C.normal(name));
    }).map(row => row.getAttribute('data-mid') || row.getAttribute('data-id') || row.id || text(row));
  }
  function hasNewAttachment(doc, name, baseline) {
    const after = attachmentEvidence(doc, name);
    const before = new Map();
    for (const item of baseline) before.set(item, (before.get(item) || 0) + 1);
    for (const item of after) {
      if (!before.get(item)) return true;
      before.set(item, before.get(item) - 1);
    }
    return false;
  }
  function resumeNotice(doc) {
    for (const el of all(doc, '.toast,.toast-content,.message-box,[role="alert"],.dialog-wrap,.dialog-container')) {
      const value = text(el);
      if (/对方.*(未回复|同意)|暂.*(无法|不能).*简历|无权发送简历|等待.*同意/.test(value)) return value.slice(0, 100);
    }
    return '';
  }
  function resumeSuccess(doc) {
    return all(doc, '.toast,.toast-content,[role="alert"]').some(el => /简历发送成功|简历已发送/.test(text(el)));
  }
  root.BossTwoStepAdapter = {visible, all, first, text, disabled, jobs, detail, block, greetButton, continueButton,
    isChat, chatMatches, resumeButton, resumes, confirmResume, attachmentEvidence, hasNewAttachment, resumeNotice, resumeSuccess};
})(globalThis);
