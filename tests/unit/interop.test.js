'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Share = require('../../share.js');
const vectors = require('../interop-test-vectors.json');

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

test('version 2 is accepted and version 3 is refused', async () => {
  const body = {v: 2, source: 'homelab-notebook', name: 'Small home lab', rate: 0.2, touEnabled: false, devices: [{id: 'host-pve1', name: 'pve1', idleW: 8, typicalW: 35, updatedAt: '2026-11-10', linked: true}], ups: [{id: 'u1', name: 'rack-ups', batteryWh: 150, hostIds: ['host-pve1']}], upgrade: {hostId: 'host-pve1', name: 'pve1', currentW: 13.4, newW: 8, price: 200, rate: 0.2, hours: 24}};
  const decoded = await Share.decodeInterop('j.' + Buffer.from(JSON.stringify(body)).toString('base64url'));
  assert.equal(decoded.v, 2);
  assert.equal(decoded.devices[0].linked, true);
  assert.equal(decoded.ups[0].batteryWh, 150);
  assert.equal(decoded.upgrade.price, 200);
  await assert.rejects(() => Share.decodeInterop('j.' + Buffer.from(JSON.stringify({v: 3, source: 'homelab-notebook', devices: []})).toString('base64url')), /doesn't read/);
});

test('the vendored tokens round-trip, and Power still emits version 1', async () => {
  assert.equal(Share.EMIT_INTEROP_V2, false);
  const decoded = await Share.decodeInterop(vectors.tokens.p);
  assert.deepEqual(decoded, vectors.interopPayload);
  const again = await Share.decodeInterop(await Share.encodeInterop(vectors.interopPayload));
  assert.deepEqual(again, vectors.interopPayload);
  assert.deepEqual(decodeCalculator(vectors.tokens.s), vectors.powerCalculatorState);
  const payload = {v: 2, source: 'homelab-power', rate: 0.2, devices: [{name: 'Pi', idleW: 3, typicalW: 5, updatedAt: '2026-11-15T20:00:00.000Z'}]};
  const asV1 = await Share.decodeInterop(await Share.encodeInterop(payload));
  assert.equal(asV1.v, 1);
  assert.equal(asV1.rate, 0.2);
  assert.equal(asV1.devices[0].updatedAt, '2026-11-15T20:00:00.000Z');
  const asV2 = await Share.decodeInterop(await Share.encodeInterop(payload, {v2: true}));
  assert.equal(asV2.v, 2);
});

test('runtime, waste flags, payback, and an encrypted Notebook file', () => {
  assert.equal(Share.upsRuntimeHours(150, 100), 150 * 0.8 * 0.9 / 100);
  assert.deepEqual(Share.wasteFlags({type: 'proxmox-node', idle: 120, loadPct: 20, hours: 24}), ['high-idle']);
  assert.deepEqual(Share.wasteFlags({type: 'pi', idle: 3, loadPct: 0, hours: 0}), ['low-use']);
  assert.equal(Share.wasteFlags({type: 'vm', idle: 40, loadPct: 0, hours: 0}).length, 0);
  assert.match(Share.encryptedLinkMessage(), /encrypted Homelab Notebook file/);
  assert.equal(Share.shouldApplyRate({region: null, rate: 0.2}), true);
  assert.equal(Share.shouldApplyRate({region: 'US-CA', rate: 0.2}), false);
  assert.equal(Share.shouldApplyRate({region: null, rate: 0.3}), false);
  const month = (13.4 - 8) * 24 / 1000 * (365 / 12) * 0.2;
  assert.ok(Math.abs(Share.upgradePayback({currentW: 13.4, newW: 8, price: 200, rate: 0.2, hours: 24}) - 200 / month) < 1e-9);
  const saved = Share.deviceFingerprint([{id: 'a', name: 'Pi', type: 'pi', idle: 3, load: 8}]);
  assert.equal(Share.changedDeviceCount(saved, [{id: 'a', name: 'Pi', type: 'pi', idle: 3, load: 8}]), 0);
  assert.equal(Share.changedDeviceCount(saved, [{id: 'a', name: 'Pi', type: 'pi', idle: 4, load: 8}]), 1);
});

test('import actions follow the Pro rules', () => {
  assert.deepEqual(Share.interopAccess({pro: false, profiles: 0}), {view: 'free', load: 'free', merge: 'pro', resync: 'pro'});
  assert.equal(Share.interopAccess({pro: false, profiles: 1}).load, 'pro');
  assert.equal(Share.interopAccess({pro: true, profiles: 1}).load, 'free');
  assert.equal(Share.interopAccess({pro: true, profiles: 20}).load, 'pro');
  assert.equal(Share.interopAccess({pro: true, profiles: 3}).merge, 'pro');
});

test('sending to Notebook explains a failure in plain language', async () => {
  const previous = global.document;
  global.document = undefined;
  await assert.rejects(
    () => Share.sendToNotebook({v: 1, source: 'homelab-power', devices: [{name: 'Pi', idleW: 3, typicalW: 5}]}),
    /Couldn't open Homelab Notebook/
  );
  global.document = previous;
});

test('an old planner link still round-trips', async () => {
  const build = {name: '8U 10" minilab', width: 10, heightU: 8, items: [{partId: 'lenovo-thinkcentre-m720q-tiny', qty: 1, placement: 'shelf', startU: null, idleOverride: null, typicalOverride: null, batteryWh: null, ownSlot: false}]};
  const back = await Share.decode(await Share.encode(build));
  assert.equal(back.name, '8U 10" minilab');
  assert.equal(back.items[0].partId, 'lenovo-thinkcentre-m720q-tiny');
});
