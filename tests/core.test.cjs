const {test} = require('node:test');
const assert = require('node:assert/strict');
const C = require('../extension/core.js');
test('岗位队列拒绝外站、非岗位链接，按岗位 ID 去重并跳过历史',()=>{
  const jobs = C.queue([
    {url:'https://evil.example/job_detail/j1.html'},
    {url:'https://www.zhipin.com.evil.example/job_detail/j1.html'},
    {url:'https://user@www.zhipin.com/job_detail/j1.html'},
    {url:'/web/geek/chat'},
    {url:'/job_detail/old.html'},
    {url:'/job_detail/j1.html?from=one',title:' 工程师 '},
    {url:'/job_detail/j1.html?from=two'},
    {url:'/job_detail/j2.html'}],{old:{}},5);
  assert.deepEqual(jobs.map(j=>j.id),['j1','j2']);
  assert.equal(jobs[0].title,'工程师');
});
test('限制本次数量并验证输入',()=>{
  for(const max of [0,51,1.5,'no'])assert.throws(()=>C.settings({max}));
  assert.equal(C.queue([{url:'/job_detail/a.html'},{url:'/job_detail/b.html'}],{},1).length,1);
});

test('旧设置默认等待 10 秒，间隔仅接受 1～600 秒整数',()=>{
  assert.equal(C.settings({max:5,resumeName:''}).intervalSeconds,10);
  assert.equal(C.settings({intervalSeconds:'30'}).intervalSeconds,30);
  for(const intervalSeconds of ['',0,-1,601,1.5,'abc',Infinity])assert.throws(()=>C.settings({intervalSeconds}));
});
test('多附件必须明确匹配，不能静默发送第一份',()=>{
  const items=[{name:'研发.pdf'},{name:'产品.pdf'}];
  assert.throws(()=>C.chooseResume(items,''));
  assert.throws(()=>C.chooseResume(items,'研发'));
  assert.equal(C.chooseResume(items,'研发.pdf'),items[0]);
  assert.equal(C.chooseResume([items[0]],''),items[0]);
  assert.throws(()=>C.chooseResume([{name:'同名.pdf'},{name:'同名.pdf'}],'同名.pdf'));
});
