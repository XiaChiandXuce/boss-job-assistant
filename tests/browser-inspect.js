async (page) => {
  return await page.evaluate(async () => {
    const host = document.querySelector('#boss-two-step');
    const ui = host?.shadowRoot;
    let stored = null;
    try { stored = await chrome.storage.session.get('run'); } catch (error) { stored = {error:String(error)}; }
    return {
      url: location.href,
      title: document.title,
      host: !!host,
      status: ui?.querySelector('#status')?.textContent,
      error: ui?.querySelector('#error')?.textContent,
      logs: ui ? [...ui.querySelectorAll('#log li')].map(el => el.textContent) : [],
      stored,
      html: document.body.innerText.slice(0, 500)
    };
  });
}
