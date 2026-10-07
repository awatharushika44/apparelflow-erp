// Read-only attack script. Every request here must be REFUSED, so nothing is written.
// Usage: BASE_URL=https://apparelflow-erp.vercel.app npm run audit:live
import { DEMO_USERS } from '../db/demo-data.mjs';

const BASE = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
let failures = 0;

function check(name, ok, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `   ${detail}`}`);
}

async function call(method, path, { cookie, body, headers = {} } = {}) {
  const h = { ...headers };
  if (cookie) h.Cookie = cookie;
  if (body !== undefined && !h['Content-Type']) h['Content-Type'] = 'application/json';
  const res = await fetch(BASE + path, {
    method,
    headers: h,
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    // empty body
  }
  return { status: res.status, data, res };
}

function expectStatus(name, r, want) {
  const wants = Array.isArray(want) ? want : [want];
  check(name, wants.includes(r.status), `(got ${r.status}, wanted ${wants.join(' or ')}) ${JSON.stringify(r.data)?.slice(0, 160)}`);
}

async function login(role) {
  const u = DEMO_USERS.find((x) => x.role === role);
  const r = await call('POST', '/api/auth/login', { body: { email: u.email, password: u.password } });
  const cookie = r.res.headers.getSetCookie?.()[0]?.split(';')[0];
  check(`login as ${role}`, r.status === 200 && Boolean(cookie), `(got ${r.status})`);
  return cookie;
}

console.log(`Target: ${BASE}\n`);

// ---- public and authentication ----
const health = await call('GET', '/api/health');
check('health is ok and the database is up', health.status === 200 && health.data?.db === 'up', JSON.stringify(health.data));
expectStatus('no cookie on /me -> 401', await call('GET', '/api/auth/me'), 401);
expectStatus('forged cookie on /me -> 401', await call('GET', '/api/auth/me', { headers: { Cookie: 'af_session=abc.def.ghi' } }), 401);
expectStatus('anonymous sewing queue -> 401', await call('GET', '/api/sewing/queue'), 401);
expectStatus('wrong password -> 401', await call('POST', '/api/auth/login', { body: { email: DEMO_USERS[0].email, password: 'nope' } }), 401);
expectStatus('unknown user -> 401', await call('POST', '/api/auth/login', { body: { email: 'ghost@x.com', password: 'nope' } }), 401);
expectStatus('broken JSON -> 400', await call('POST', '/api/auth/login', { body: '{bad' }), 400);
expectStatus('empty credentials -> 422', await call('POST', '/api/auth/login', { body: { email: '', password: '' } }), 422);
expectStatus('text/plain body -> 415', await call('POST', '/api/auth/login', { body: 'x', headers: { 'Content-Type': 'text/plain' } }), 415);
expectStatus('cross-site Origin -> 403', await call('POST', '/api/auth/login', {
  body: { email: DEMO_USERS[0].email, password: DEMO_USERS[0].password },
  headers: { Origin: 'https://evil.example' },
}), 403);

const sup = await login('cutting_supervisor');
const ver = await login('cutting_verifier');
const sew = await login('sewing_supervisor');

// ---- find the seeded demo orders through the real API ----
const listRes = await call('GET', '/api/orders', { cookie: sup });
const list = Array.isArray(listRes.data) ? listRes.data : (listRes.data?.orders ?? []);
const idOf = (no) => list.find((o) => (o.orderNo ?? o.order_no) === no)?.id;
const ids = Object.fromEntries(['CO-0001', 'CO-0002', 'CO-0003'].map((n) => [n, idOf(n)]));
check('found the seeded demo orders through GET /api/orders', Object.values(ids).every(Boolean),
  `(ids ${JSON.stringify(ids)}; response keys ${Object.keys(listRes.data ?? {})})`);

// ---- supervisor: wrong role, bad input, wrong state ----
const approvePath = (id) => `/api/verification/orders/${id}/approve`;
expectStatus('supervisor approve -> 403', await call('POST', approvePath(ids['CO-0003']), { cookie: sup, body: {} }), 403);
expectStatus('supervisor save counts -> 403', await call('PUT', `/api/verification/orders/${ids['CO-0003']}/counts`, { cookie: sup, body: { counts: [] } }), 403);
expectStatus('supervisor sewing queue -> 403', await call('GET', '/api/sewing/queue', { cookie: sup }), 403);
expectStatus('supervisor verification list -> 403', await call('GET', '/api/verification/orders', { cookie: sup }), 403);
expectStatus('submit an order that is already pending -> 409', await call('POST', `/api/orders/${ids['CO-0002']}/submit`, { cookie: sup, body: {} }), 409);

const base = { recipeCode: 'REC-BL01', targetQty: 50, fabricRollId: 'FAB-ATTACK', actualFabricYards: 94 };
const BAD_ORDERS = [
  ['negative quantity', { targetQty: -1 }],
  ['zero quantity', { targetQty: 0 }],
  ['decimal quantity', { targetQty: 2.5 }],
  ['text quantity', { targetQty: '50' }],
  ['huge quantity', { targetQty: 9999999999 }],
  ['decimal yards', { actualFabricYards: 94.5 }],
  ['negative yards', { actualFabricYards: -5 }],
  ['text yards', { actualFabricYards: 'abc' }],
  ['blank roll id', { fabricRollId: '   ' }],
  ['missing recipe', { recipeCode: undefined }],
];
for (const [name, patch] of BAD_ORDERS) {
  expectStatus(`create order with ${name} -> 422`, await call('POST', '/api/orders', { cookie: sup, body: { ...base, ...patch } }), 422);
}
expectStatus('create order with unknown recipe -> refused', await call('POST', '/api/orders', { cookie: sup, body: { ...base, recipeCode: 'REC-NOPE' } }), [404, 422]);

// ---- verifier: the hard stop ----
expectStatus('verifier create order -> 403', await call('POST', '/api/orders', { cookie: ver, body: base }), 403);
expectStatus('verifier sewing queue -> 403', await call('GET', '/api/sewing/queue', { cookie: ver }), 403);
const blocked = await call('POST', approvePath(ids['CO-0003']), { cookie: ver, body: {} });
check('approve the short batch CO-0003 -> 422 naming the sleeves', blocked.status === 422 && JSON.stringify(blocked.data).includes('Sleeves'),
  `(got ${blocked.status}) ${JSON.stringify(blocked.data)?.slice(0, 200)}`);
expectStatus('forged verifierId and status in the body are ignored -> still 422', await call('POST', approvePath(ids['CO-0003']), {
  cookie: ver, body: { verifierId: '1', status: 'VERIFIED', decision: 'APPROVED' },
}), 422);
expectStatus('approve a draft order -> 409', await call('POST', approvePath(ids['CO-0001']), { cookie: ver, body: {} }), 409);
expectStatus('reject with no note -> 422', await call('POST', `/api/verification/orders/${ids['CO-0003']}/reject`, { cookie: ver, body: {} }), 422);
expectStatus('reject with a blank note -> 422', await call('POST', `/api/verification/orders/${ids['CO-0003']}/reject`, { cookie: ver, body: { rejectionNote: '   ' } }), 422);

// ---- sewing: isolation ----
const plain = await call('GET', '/api/sewing/queue', { cookie: sew });
const hostile = await call('GET', '/api/sewing/queue?status=PENDING_VERIFICATION&all=1&id=1%20OR%201=1', { cookie: sew });
const nos = (r) => (r.data?.orders ?? []).map((o) => o.orderNo).sort().join(',');
check('sewing queue loads', plain.status === 200, `(got ${plain.status})`);
check('hostile query string does not change the queue', nos(plain) === nos(hostile), `${nos(plain)}  vs  ${nos(hostile)}`);
check('queue contains no draft, pending or rejected demo order',
  !['CO-0001', 'CO-0002', 'CO-0003', 'CO-0006'].some((n) => nos(plain).includes(n)), nos(plain));
expectStatus('sewing opens a pending order by id -> 404', await call('GET', `/api/sewing/orders/${ids['CO-0002']}`, { cookie: sew }), 404);
expectStatus('sewing opens the short order by id -> 404', await call('GET', `/api/sewing/orders/${ids['CO-0003']}`, { cookie: sew }), 404);
expectStatus('sewing starts an order that is not verified -> 409', await call('POST', `/api/sewing/orders/${ids['CO-0003']}/start`, { cookie: sew, body: {} }), 409);
expectStatus('sewing starts an unknown order -> 404', await call('POST', '/api/sewing/orders/999999/start', { cookie: sew, body: {} }), 404);

console.log(failures === 0 ? '\nAll attack checks passed: everything hostile was refused.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);