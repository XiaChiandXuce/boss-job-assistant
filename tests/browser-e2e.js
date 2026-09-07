async (page) => {
  await page.waitForFunction(() => !!document.querySelector('#boss-two-step')?.shadowRoot, null, {timeout: 10000});
  const initial = await page.evaluate(() => {
    const ui = document.querySelector('#boss-two-step').shadowRoot;
    return {title: document.title, panel: ui.querySelector('strong')?.textContent, status: ui.querySelector('#status')?.textContent};
  });
  await page.evaluate(() => {
    const ui = document.querySelector('#boss-two-step').shadowRoot;
    ui.querySelector('#max').value = '1';
    ui.querySelector('#resume').value = '测试附件.pdf';
    ui.querySelector('#start').click();
  });
  await page.waitForFunction(() => {
    const ui = document.querySelector('#boss-two-step')?.shadowRoot;
    return ui?.querySelector('#status')?.textContent.includes('已完成');
  }, null, {timeout: 30000});
  const final = await page.evaluate(() => {
    const ui = document.querySelector('#boss-two-step').shadowRoot;
    return {
      url: location.href,
      status: ui.querySelector('#status').textContent,
      error: ui.querySelector('#error').textContent,
      logs: [...ui.querySelectorAll('#log li')].map(li => li.textContent),
      attachments: [...document.querySelectorAll('.chat-message .resume-card')].map(el => el.textContent.trim())
    };
  });
  return {initial, final};
}
