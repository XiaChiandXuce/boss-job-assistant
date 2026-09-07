const {test} = require('node:test');
const assert = require('node:assert/strict');
const {page} = require('./harness.cjs');
test('隐藏按钮、另一个会话和侧栏旧岗位不能触发发送',()=>{
  const dom=page(`<div style="display:none"><a>立即沟通</a></div><a class="btn-startchat">立即沟通</a>
    <div class="chat-list"><a href="/job_detail/j1.html">目标岗位</a></div>
    <div class="position-content"><a href="/job_detail/j2.html">另一个岗位</a></div>`);
  const A=dom.window.BossTwoStepAdapter,doc=dom.window.document;
  assert.equal(A.greetButton(doc).className,'btn-startchat');
  assert.equal(A.chatMatches(doc,{id:'j1'}),false);
  assert.equal(A.chatMatches(doc,{id:'j2'}),true);
  dom.window.close();
});
test('会话外的文件、旧附件、失败和等待中的附件不算发送成功',()=>{
  const dom=page(`<div class="chat-message"><ul><li class="item-my" data-id="old"><div class="resume-card">简历.pdf</div></li></ul></div>
    <div class="resume-list"><div class="resume-card">简历.pdf</div></div>`);
  const A=dom.window.BossTwoStepAdapter,doc=dom.window.document;
  const before=A.attachmentEvidence(doc,'简历.pdf');
  assert.equal(A.hasNewAttachment(doc,'简历.pdf',before),false);
  const li=doc.createElement('li');li.className='item-my';li.dataset.id='new';li.dataset.status='pending';li.innerHTML='<div class="resume-card">简历.pdf</div>';
  doc.querySelector('ul').append(li);
  assert.equal(A.hasNewAttachment(doc,'简历.pdf',before),false);
  li.dataset.status='failed';assert.equal(A.hasNewAttachment(doc,'简历.pdf',before),false);
  li.dataset.status='sent';assert.equal(A.hasNewAttachment(doc,'简历.pdf',before),true);
  dom.window.close();
});
test('附件确认按钮限定在简历弹窗内',()=>{
  const dom=page('<button>发送</button><div class="dialog-wrap"><ul class="resume-list"><li class="list-item"><span class="resume-name">简历.pdf</span></li></ul><button id="right">发送</button></div>');
  assert.equal(dom.window.BossTwoStepAdapter.confirmResume(dom.window.document).id,'right');
  dom.window.close();
});
