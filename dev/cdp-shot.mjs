/**
 * 用 CDP 打开真实 DSH 页面并截图（不进入交付包，仅供本地验收）。
 * 用法：node dev/cdp-shot.mjs <url> <out.png> ["js 表达式"] [等待毫秒]
 */
import { writeFileSync } from 'node:fs';

const [url, out, expr = '', waitMs = '9000'] = process.argv.slice(2);
const port = 9223;
const list = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
const target = list.find((t) => t.type === 'page');
if (!target) throw new Error('no page target');

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true });
  ws.addEventListener('error', reject, { once: true });
});

let nextId = 1;
const pending = new Map();
ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(JSON.stringify(msg.error)));
    else resolve(msg.result);
  }
});
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url });
await sleep(Number(waitMs));
const info = await send('Runtime.evaluate', {
  expression: 'JSON.stringify({ title: document.title, hasWidget: !!document.querySelector(".dss-trigger"), text: document.body.innerText.slice(0, 200) })',
  returnByValue: true,
});
console.log('PAGE', info.result.value);
if (expr) {
  const result = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  console.log('EVAL', JSON.stringify(result.result && result.result.value));
  await sleep(1200);
}
const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(out, Buffer.from(shot.data, 'base64'));
console.log('saved', out);
ws.close();
