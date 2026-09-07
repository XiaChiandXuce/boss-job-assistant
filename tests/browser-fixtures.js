async (page) => {
  const style = '<style>body{font:16px system-ui;padding:45px;background:#edf5f3;color:#24453c}main{max-width:820px}h1{font-size:26px}a,button,.toolbar-btn{cursor:pointer}a,button{background:#008d7b;color:white;padding:12px 18px;border:0;border-radius:7px;display:inline-block;margin:8px}.job-card-box,.job-banner,.chat-message,.dialog-wrap{padding:22px;background:white;border-radius:14px;margin:20px 0}.resume-list li{padding:12px;cursor:pointer}.active{outline:2px solid #008d7b}.toolbar-btn{padding:18px;background:#ddd;width:100px}.resume-card{background:#e3f1ec;padding:20px}button:disabled{opacity:.4}h2{font-size:16px;color:#638079}</style>';
  const list = `<h1>本地模拟 · 职位列表</h1><h2>这不是 BOSS 实站，所有网络请求都被测试拦截。</h2><main><ul>
    <li class="job-card-box"><span class="job-name">示例工程师</span><span class="company-name">测试公司</span><a href="https://www.zhipin.com/job_detail/fixture1.html">查看岗位</a></li></ul></main>`;
  const detail = `<h1>本地模拟 · 岗位详情</h1><h2>仅验证程序，不会发送真实消息。</h2><main>
    <div class="job-banner"><h1>示例工程师</h1><a class="btn-startchat" href="https://www.zhipin.com/web/geek/chat?fixture=1">立即沟通</a></div>
    <div class="sider-company"><span class="company-name">测试公司</span></div></main>`;
  const chat = `<h1>本地模拟 · 聊天页</h1><main><div class="position-content"><a href="https://www.zhipin.com/job_detail/fixture1.html"><span class="position-name">示例工程师</span></a>测试公司</div>
    <div class="chat-message"><ul class="im-list"><li class="item-my">你好，我对这个岗位感兴趣。</li></ul></div><div class="toolbar-btn">发简历</div></main>
    <script>document.querySelector('.toolbar-btn').onclick=()=>{const d=document.createElement('div');d.className='dialog-wrap';d.innerHTML='<ul class="resume-list"><li class="list-item"><span class="resume-name">测试附件.pdf</span></li></ul><button disabled>发送</button>';document.querySelector('main').append(d);d.querySelector('li').onclick=()=>{d.querySelector('li').classList.add('active');d.querySelector('button').disabled=false};d.querySelector('button').onclick=()=>{const li=document.createElement('li');li.className='message-item item-my';li.dataset.id='attachment1';li.innerHTML='<div class="resume-card">测试附件.pdf</div>';document.querySelector('.im-list').append(li);d.remove()}};</script>`;
  await page.context().route('**/*',route=>{
    const url=route.request().url();
    if(!url.startsWith('https://www.zhipin.com/'))return route.abort();
    const body=url.includes('/job_detail/')?detail:url.includes('/chat')?chat:list;
    return route.fulfill({status:200,contentType:'text/html; charset=utf-8',body:'<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>两步助手 · 本地测试</title>'+style+'<body>'+body+'</body></html>'});
  });
  await page.goto('https://www.zhipin.com/web/geek/jobs');
  return {extensionWorkers:page.context().serviceWorkers().map(worker=>worker.url())};
}
