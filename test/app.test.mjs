import {after, before, test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';

process.env.AEGIS_AUTOSTART = '0';
const {createMissionSystem} = await import('../dist/server.js');
const system = createMissionSystem();
let base;

function listen(server) {
  return new Promise(resolve => server.listen(0, '127.0.0.1', () =>
    resolve(server.address().port)));
}

function close(server) {
  return new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

async function post(path, body, cookie) {
  return fetch(`${base}${path}`, {method: 'POST',
    headers: {'content-type': 'application/json', ...(cookie ? {cookie} : {})},
    body: JSON.stringify(body)});
}

async function crewCookie() {
  const login = await post('/api/auth/login',
    {email: 'vega@aegis.test', password: 'orbital-42'});
  const {challengeId} = await login.json();
  const verified = await post('/api/auth/verify-2fa', {challengeId, code: '739216'});
  assert.equal(verified.status, 200);
  return verified.headers.get('set-cookie').split(';')[0];
}

before(async () => {
  await listen(system.internal);
  base = `http://127.0.0.1:${await listen(system.app)}`;
});

after(async () => {
  await Promise.all([close(system.app), close(system.internal)]);
  system.db.close();
});

test('mission page, version, and public briefing are available', async () => {
  const [page, head, version, briefing] = await Promise.all([
    fetch(base), fetch(base, {method: 'HEAD'}), fetch(`${base}/api/system/version`),
    fetch(`${base}/api/public/briefing`)
  ]);
  assert.equal(page.status, 200);
  assert.equal(head.status, 200);
  assert.match(await page.text(), /Aegis Mission Control/);
  assert.equal((await version.json()).app, 'Aegis Mission Control');
  assert.equal((await briefing.json()).asteroid, '2026 QX-9');
});

test('normal telemetry search returns public observations', async () => {
  const response = await fetch(`${base}/api/telemetry/search?q=Asteroid`);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.count, 1);
  assert.match(result.items[0].signal, /spectral scan/);
});

test('ordinary crew login requires a password and second factor', async () => {
  const wrongPassword = await post('/api/auth/login',
    {email: 'vega@aegis.test', password: 'wrong'});
  assert.equal(wrongPassword.status, 401);

  const login = await post('/api/auth/login',
    {email: 'vega@aegis.test', password: 'orbital-42'});
  assert.equal(login.status, 200);
  const {challengeId} = await login.json();
  assert.ok(challengeId);
  const wrongCode = await post('/api/auth/verify-2fa',
    {challengeId, code: '111111', rememberDevice: false});
  assert.equal(wrongCode.status, 401);
  const verified = await post('/api/auth/verify-2fa',
    {challengeId, code: '739216', rememberDevice: false});
  assert.equal(verified.status, 200);
  assert.match(verified.headers.get('set-cookie'), /aegis_session=/);
});

test('authenticated crew can read controls and adjust the simulated vector', async () => {
  const anonymous = await fetch(`${base}/api/mission/controls`);
  assert.equal(anonymous.status, 401);
  const cookie = await crewCookie();
  const controls = await fetch(`${base}/api/mission/controls`, {headers: {cookie}});
  assert.equal(controls.status, 200);
  assert.equal((await controls.json()).crew, 'Cmdr. Vega');
  const update = await post('/api/mission/vector', {angle: 34.2, thrust: 71}, cookie);
  assert.equal(update.status, 200);
  assert.equal((await update.json()).vector.angle, 34.2);
  const danger = await post('/api/mission/vector', {angle: 0, thrust: 0}, cookie);
  assert.ok((await danger.json()).confidence < 30);
  const briefing = await fetch(`${base}/api/public/briefing`);
  assert.equal((await briefing.json()).status, 'COLLISION COURSE DETECTED');
  const events = await fetch(`${base}/api/public/events`);
  assert.match(JSON.stringify(await events.json()), /Burn vector changed/);
  await post('/api/mission/vector', {angle: 32.4, thrust: 68}, cookie);
});

test('remote preview and a crew uplink check work with ordinary inputs', async () => {
  const feed = createServer((_req, res) => res.end('Observatory feed nominal'));
  const feedPort = await listen(feed);
  try {
    const preview = await post('/api/probes/preview',
      {sourceUrl: `http://127.0.0.1:${feedPort}/feed`});
    assert.equal(preview.status, 200);
    assert.match((await preview.json()).preview, /Observatory feed nominal/);
  } finally {
    await close(feed);
  }
  const cookie = await crewCookie();
  const uplink = await post('/api/diagnostics/uplink', {target: 'relay-7'}, cookie);
  assert.equal(uplink.status, 200);
  assert.match((await uplink.json()).output, /relay-7/);
});
