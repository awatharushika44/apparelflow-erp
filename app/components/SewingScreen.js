'use client';

import { useCallback, useEffect, useState } from 'react';
import '../sewing.css';

async function api(path, options = {}) {
  const res = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json' } });
  let data = null;
  try {
    data = await res.json();
  } catch {
    // empty body
  }
  return { ok: res.ok, status: res.status, data };
}

const WORDS = { GREEN: 'MATCH', YELLOW: 'EXCESS', RED: 'SHORTAGE' };
const SHAPES = {
  GREEN: <><circle cx="12" cy="12" r="10" /><path d="M7.5 12.5l3 3 6-7" /></>,
  YELLOW: <><path d="M12 3L22 21H2z" /><path d="M12 10v6M9 13h6" /></>,
  RED: <><polygon points="8,2 16,2 22,8 22,16 16,22 8,22 2,16 2,8" /><path d="M8.5 8.5l7 7M15.5 8.5l-7 7" /></>,
};

function Chip({ light }) {
  const key = SHAPES[light] ? light : 'GREEN';
  return (
    <span className={`sw-chip sw-chip-${key}`}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        {SHAPES[key]}
      </svg>
      <span>{WORDS[key]}</span>
    </span>
  );
}

const when = (iso) => (iso ? new Date(iso).toLocaleString() : '');

export default function SewingScreen() {
  const [tab, setTab] = useState('queue');
  const [queue, setQueue] = useState([]);
  const [active, setActive] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [order, setOrder] = useState(null);
  const [msg, setMsg] = useState({ kind: '', text: '' });
  const [busy, setBusy] = useState(false);

  // Everything comes from the API, so a reload shows the same data.
  const loadLists = useCallback(async () => {
    const [q, a] = await Promise.all([api('/api/sewing/queue'), api('/api/sewing/active')]);
    if (!q.ok || !a.ok) {
      setMsg({ kind: 'alert', text: q.data?.error?.message || a.data?.error?.message || 'Could not load. Sign in again.' });
      return;
    }
    setQueue(q.data.orders);
    setActive(a.data.orders);
  }, []);

  useEffect(() => {
// eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount: state is set only after the request starts
    loadLists();
  }, [loadLists]);

  async function open(id) {
    setOpenId(id);
    setMsg({ kind: '', text: '' });
    const res = await api(`/api/sewing/orders/${id}`);
    if (!res.ok) {
      setMsg({ kind: 'alert', text: res.data?.error?.message || 'Could not open that batch.' });
      setOpenId(null);
      return;
    }
    setOrder(res.data.order);
  }

  function back() {
    setOpenId(null);
    setOrder(null);
    loadLists();
  }

  async function start() {
    setBusy(true);
    const res = await api(`/api/sewing/orders/${order.id}/start`, { method: 'POST', body: '{}' });
    setBusy(false);
    if (!res.ok) {
      setMsg({ kind: 'alert', text: res.data?.error?.message || 'Could not start sewing.' });
      return;
    }
    setMsg({ kind: 'flash', text: `Assembly started on ${order.orderNo}.` });
    setTab('active');
    setOpenId(null);
    setOrder(null);
    await loadLists();
  }

  const banner = msg.text && (
    <p className={msg.kind === 'flash' ? 'sw-flash' : 'sw-alert'} role={msg.kind === 'flash' ? 'status' : 'alert'}>
      {msg.text}
    </p>
  );

  // ---------- detail view ----------
  if (openId && order) {
    const started = order.status === 'SEWING_STARTED';
    return (
      <div className="sw-wrap">
        <button className="sw-btn sw-btn-plain" onClick={back} style={{ width: 'fit-content' }}>← Back to the lanes</button>
        {banner}

        <section className="sw-card" aria-labelledby="sw-title">
          <h2 id="sw-title">{order.orderNo}: {order.targetQty} × {order.recipeName}</h2>
          <p className="sw-meta">Roll {order.fabricRollId} · {order.actualFabricYards} yd used</p>
        </section>

        <section className="sw-card sw-sign" aria-label="Verification record">
          <h2>Signed off by {order.verifiedBy}</h2>
          <p className="sw-meta">Verified {when(order.verifiedAt)}</p>
          {order.auditNote
            ? <p className="sw-note">Verifier note: {order.auditNote}</p>
            : <p className="sw-meta">The verifier left no note.</p>}
        </section>

        <section aria-labelledby="sw-counts">
          <h2 id="sw-counts">Verified counts</h2>
          <div className="sw-grid">
            {order.items.map((i) => (
              <article key={i.component} className="sw-item">
                <h3>{i.component}</h3>
                <p className="sw-nums">
                  <span>Expected <strong>{i.expected}</strong></span>
                  <span>Counted <strong>{i.actual}</strong></span>
                  <span>Variance <strong>{i.variance > 0 ? `+${i.variance}` : i.variance}</strong></span>
                </p>
                <Chip light={i.light} />
              </article>
            ))}
          </div>
        </section>

        <section className="sw-card" aria-labelledby="sw-waste">
          <h2 id="sw-waste">Fabric wastage</h2>
          <p><strong>{order.wastagePct}%</strong> · expected {order.expectedYards} yd, used {order.actualFabricYards} yd</p>
          {order.overCap && <p className="sw-warn" role="status">This batch was over the recipe wastage cap when it was verified.</p>}
        </section>

        {started ? (
          <p className="sw-note">Assembly started by {order.sewingStartedBy} on {when(order.sewingStartedAt)}.</p>
        ) : (
          <button className="sw-btn" onClick={start} disabled={busy} style={{ width: 'fit-content' }}>
            {busy ? 'Starting...' : 'Start Sewing Assembly'}
          </button>
        )}
      </div>
    );
  }

  // ---------- lanes ----------
  const rows = tab === 'queue' ? queue : active;
  return (
    <div className="sw-wrap">
      {banner}
      <div className="sw-tabs" role="group" aria-label="Sewing lanes">
        <button className="sw-tab" aria-pressed={tab === 'queue'} onClick={() => setTab('queue')}>Ready for Sewing ({queue.length})</button>
        <button className="sw-tab" aria-pressed={tab === 'active'} onClick={() => setTab('active')}>In Assembly ({active.length})</button>
      </div>

      <section aria-labelledby="sw-lane">
        <h2 id="sw-lane">{tab === 'queue' ? 'Ready for Sewing' : 'In Assembly'}</h2>
        {rows.length === 0 && <p>{tab === 'queue' ? 'No verified batches are waiting.' : 'No batches are in assembly yet.'}</p>}
        <ul className="sw-list">
          {rows.map((o, idx) => (
            <li key={`${tab}-${o.id}`} className="sw-card sw-row sw-slide" style={{ '--i': idx }}>
              <div>
                <p><strong>{o.orderNo}</strong> {o.targetQty} × {o.recipeName}</p>
                <p className="sw-meta">
                  Verified by {o.verifiedBy} · {when(o.verifiedAt)}
                  {tab === 'active' && o.sewingStartedAt ? ` · started ${when(o.sewingStartedAt)}` : ''}
                </p>
              </div>
              <button className="sw-btn" onClick={() => open(o.id)}>{tab === 'queue' ? 'Review batch' : 'View batch'}</button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}