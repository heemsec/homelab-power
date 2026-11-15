'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Share = require('../../share.js');
const vectors = require('../../interop/test-vectors.json');

function decodeCalculator(token) {
  const text = String(token).replace(/^#?s=/, '').replace(/-/g, '+').replace(/_/g, '/');
  const pad = text.length % 4 === 0 ? '' : '='.repeat(4 - (text.length % 4));
  return JSON.parse(Buffer.from(text + pad, 'base64').toString('utf8'));
}

test('the shared #p= token matches the interop payload', async () => {
  const decoded = await Share.decodeInterop(vectors.tokens.p);
  assert.deepEqual(decoded, vectors.interopPayload);
});

test('the shared #s= token matches the calculator state', () => {
  assert.deepEqual(decodeCalculator(vectors.tokens.s), vectors.powerCalculatorState);
});

test('a #p= payload round-trips and skips wall-less guests', async () => {
  const payload = {
    v: 1,
    source: 'homelab-power',
    name: 'Rack',
    voltageMode: '230',
    voltage: 230,
    breaker: 16,
    devices: [
      {id: 'sw', name: 'Switch', type: 'switch', partId: 'tp-link-tl-sg108-8-port-gigabit-unmanaged', idleW: 2, typicalW: 4, qty: 2},
      {id: 'guest', name: 'haos', type: 'vm', idleW: 0, typicalW: 0, qty: 1},
      {name: 'Later', idleW: 100001, typicalW: -4, qty: 0}
    ]
  };
  const decoded = await Share.decodeInterop(await Share.encodeInterop(payload));
  assert.equal(decoded.source, 'homelab-power');
  assert.equal(decoded.voltage, 230);
  assert.equal(decoded.devices[2].idleW, 100000);
  assert.equal(decoded.devices[2].typicalW, 0);
  assert.equal(decoded.devices[2].qty, 1);
  const devices = Share.devicesFromInterop(decoded);
  assert.equal(devices.length, 3);
  assert.equal(devices[0].name, 'Switch');
  assert.equal(devices[0].linkId, 'sw');
  assert.equal(devices[1].name, 'Switch 2');
  assert.equal(devices[1].idle, 2);
  assert.equal(devices[1].load, 4);
  assert.equal(devices[2].name, 'Later');
  assert.equal(devices.some(d => d.name === 'haos'), false);
});

test('a newer interchange version is refused', async () => {
  const token = await Share.encodeInterop({v: 1, source: 'homelab-power', devices: [{name: 'Pi', idleW: 3, typicalW: 5}]});
  const raw = await Share.decodeInterop(token);
  assert.equal(raw.v, 1);
  await assert.rejects(() => Share.decodeInterop('j.' + Buffer.from(JSON.stringify({v: 2, source: 'homelab-notebook', devices: []})).toString('base64url')), /doesn't read/);
});

test('import actions follow the Pro rules', () => {
  assert.deepEqual(Share.interopAccess({pro: false, profiles: 0}), {view: 'free', load: 'free', merge: 'pro', resync: 'pro'});
  assert.equal(Share.interopAccess({pro: false, profiles: 1}).load, 'pro');
  assert.equal(Share.interopAccess({pro: true, profiles: 1}).load, 'free');
  assert.equal(Share.interopAccess({pro: true, profiles: 20}).load, 'pro');
  assert.equal(Share.interopAccess({pro: true, profiles: 3}).merge, 'pro');
});

test('an old planner link still round-trips', async () => {
  const build = {name: '8U 10" minilab', width: 10, heightU: 8, items: [{partId: 'lenovo-thinkcentre-m720q-tiny', qty: 1, placement: 'shelf', startU: null, idleOverride: null, typicalOverride: null, batteryWh: null, ownSlot: false}]};
  const back = await Share.decode(await Share.encode(build));
  assert.equal(back.name, '8U 10" minilab');
  assert.equal(back.items[0].partId, 'lenovo-thinkcentre-m720q-tiny');
});
