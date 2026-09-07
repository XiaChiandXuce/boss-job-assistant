const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {JSDOM} = require('jsdom');
const root = path.join(__dirname,'../extension');
const source = file => fs.readFileSync(path.join(root,file),'utf8');
const copy = value => value == null ? value : structuredClone(value);
const event = () => ({listeners:[],addListener(fn){this.listeners.push(fn);}});
function storage() {
  const values = {};
  return {values, async get(key){return {[key]:copy(values[key])};},async set(data){Object.assign(values,copy(data));}};
}
function background() {
  let now = Date.now();
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const tabs = new Map(); let nextId = 10;
  const chrome = {storage:{session:storage(),local:storage()},runtime:{onMessage:event()},action:{onClicked:event()},
    tabs:{onUpdated:event(),onRemoved:event(),
      async create(options){const tab = {id:nextId++,...options}; tabs.set(tab.id,tab);return {...tab};},
      async update(id,options){if(!tabs.has(id))throw Error('missing tab');Object.assign(tabs.get(id),options);return {...tabs.get(id)};},
      async sendMessage(){}, async remove(id){tabs.delete(id);}
    }};
  const context = vm.createContext({chrome,console,URL,Date:ClockDate,crypto:require('node:crypto').webcrypto,structuredClone});
  context.importScripts = file => vm.runInContext(source(file),context);
  vm.runInContext(source('background.js'),context);
  function post(message,id = 1,url = 'https://www.zhipin.com/web/geek/jobs') {
    return new Promise(resolve => chrome.runtime.onMessage.listeners[0](copy(message),{url,tab:{id,url}},resolve));
  }
  return {chrome,tabs,post,now:()=>now,advance:ms=>{now+=ms;},run:()=>copy(chrome.storage.session.values.run),history:()=>copy(chrome.storage.local.values.history)};
}
function page(html,url = 'https://www.zhipin.com/job_detail/j1.html') {
  const dom = new JSDOM(html,{url,runScripts:'outside-only',pretendToBeVisual:true});
  Object.defineProperty(dom.window.HTMLElement.prototype,'getClientRects',{value:function(){
    let el=this;
    while(el){if(el.hidden || el.style?.display==='none' || el.style?.visibility==='hidden')return [];el=el.parentElement;}
    return [{x:0,y:0,width:100,height:30}];
  }});
  dom.window.HTMLElement.prototype.scrollIntoView = function(){};
  dom.window.eval(source('core.js'));dom.window.eval(source('adapter.js'));
  return dom;
}
async function content(dom,bg,id) {
  let tick;
  dom.window.Date.now = bg.now;
  dom.window.setInterval = fn => {tick=fn;return 1;};
  dom.window.chrome={runtime:{sendMessage:message=>bg.post(message,id,dom.window.location.href),onMessage:event()}};
  dom.window.eval(source('content.js'));
  await drain();
  return {async tick(){await tick();await drain();}, ui:dom.window.document.querySelector('#boss-two-step').shadowRoot};
}
async function drain(){for(let i=0;i<5;i++)await new Promise(resolve=>setImmediate(resolve));}
module.exports={background,page,content,drain,source};
