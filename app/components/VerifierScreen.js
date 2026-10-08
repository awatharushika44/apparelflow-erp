'use client';

import { useCallback, useEffect, useState } from 'react';
import '../verifier.css';
import { GateIllustration } from './Gate';
import { computeWastage } from '../../lib/domain/wastage.js';

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

// Zero is a valid count (and RED), so this differs from the supervisor's "greater than zero" rule.
function parseCount(text) {
  const t = text.trim();
  if (t === '') return { empty: true };
  if (t.startsWith('-')) return { error: 'A count cannot be negative.' };
  if (/[.,]/.test(t)) return { error: 'A count must be a whole number, with no decimals.' };
  if (!/^\d+$/.test(t)) return { error: 'A count must be digits only.' };
  if (Number(t) > 1000000) return { error: 'That count is too large.' };
  return { value: Number(t) };
}

// Preview light only. The server recomputes every light itself.
function previewLight(expected, actual) {
  if (actual === expected) return 'GREEN';
  return actual > expected ? 'YELLOW' : 'RED';
}

const WORDS = { GREEN: 'MATCH', YELLOW: 'EXCESS', RED: 'SHORTAGE', UNCOUNTED: 'NOT COUNTED' };
const SHAPES = {
  GREEN: <><circle cx="12" cy="12" r="10" /><path d="M7.5 12.5l3 3 6-7" /></>,
  YELLOW: <><path d="M12 3L22 21H2z" /><path d="M12 10v6M9 13h6" /></>,
  RED: <><polygon points="8,2 16,2 22,8 22,16 16,22 8,22 2,16 2,8" /><path d="M8.5 8.5l7 7M15.5 8.5l-7 7" /></>,
  UNCOUNTED: <rect x="3" y="3" width="18" height="18" rx="2" strokeDasharray="3 3" />,
};

function Chip({ light, count }) {
  const key = SHAPES[light] ? light : 'UNCOUNTED';
  return (
    <span className={`vf-chip vf-chip-${key}`}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        {SHAPES[key]}
      </svg>
      <span>{WORDS[key]}</span>
      {count != null && <span>{count}</span>}
    </span>
  );
}

export default function VerifierScreen() {
  const [list, setList] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [order, setOrder] = useState(null);
  const [draft, setDraft] = useState({});
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState({ kind: '', text: '' });
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  const [reasonTouched, setReasonTouched] = useState(false);
  const [ack, setAck] = useState(false);

  const loadList = useCallback(async () => {
    const [l, r] = await Promise.all([api('/api/verification/orders'), api('/api/recipes')]);
    if (!l.ok) {
      setMsg({ kind: 'alert', text: l.data?.error?.message || 'Could not load batches. Sign in again.' });
      return;
    }
    setList(l.data.orders);
    if (r.ok) setRecipes(r.data.recipes);
  }, []);

  const loadOrder = useCallback(async (id) => {
    const res = await api(`/api/verification/orders/${id}`);
    if (!res.ok) {
      setMsg({ kind: 'alert', text: res.data?.error?.message || 'Could not open that batch.' });
      return;
    }
    const o = res.data.order;
    setOrder(o);
    setDraft(Object.fromEntries(o.items.map((i) => [i.componentId, i.actualQty == null ? '' : String(i.actualQty)])));
    setDirty(false);
  }, []);

  useEffect(() => {
// eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount: state is set only after the request starts
    loadList();
  }, [loadList]);

  function open(id) {
    setOpenId(id);
    setMsg({ kind: '', text: '' });
    setNote('');
    setReason('');
    setReasonTouched(false);
    setAck(false);
    loadOrder(id);
  }

  function back() {
    setOpenId(null);
    setOrder(null);
    loadList();
  }

  function type(componentId, text) {
    setDraft((d) => ({ ...d, [componentId]: text }));
    setDirty(true);
    setMsg({ kind: '', text: '' });
  }

  const parsed = order ? Object.fromEntries(order.items.map((i) => [i.componentId, parseCount(draft[i.componentId] ?? '')])) : {};
  const hasErrors = Object.values(parsed).some((p) => p.error);

  async function saveCounts() {
    const counts = order.items
      .filter((i) => parsed[i.componentId]?.value !== undefined)
      .map((i) => ({ componentId: i.componentId, actualQty: parsed[i.componentId].value }));
    if (hasErrors || counts.length === 0) {
      setMsg({ kind: 'alert', text: hasErrors ? 'Fix the highlighted counts first.' : 'Enter at least one count.' });
      return;
    }
    setBusy(true);
    const res = await api(`/api/verification/orders/${order.id}/counts`, { method: 'PUT', body: JSON.stringify({ counts }) });
    setBusy(false);
    if (!res.ok) {
      setMsg({ kind: 'alert', text: res.data?.error?.message || 'Could not save the counts.' });
      return;
    }
    setMsg({ kind: 'flash', text: 'Counts saved. The gate below shows what the server decided.' });
    await loadOrder(order.id);
  }

  // Wastage preview for display; the server computes and stores the real figure.
  let wastage = null;
  const recipe = order && recipes.find((r) => r.recipeCode === order.recipeCode);
  if (order && recipe) {
    try {
      wastage = computeWastage({
        targetQty: order.targetQty,
        stdFabricYards: recipe.stdFabricYards,
        wastageCap: recipe.wastageCap,
        actualYards: order.actualFabricYards,
      });
    } catch {
      wastage = null;
    }
  }
  const overCap = Boolean(wastage?.overCap);

  const gateOpen = Boolean(order?.canApprove) && !dirty;
  const blockers = order?.blockers ?? [];

  async function approve() {
    setBusy(true);
    const res = await api(`/api/verification/orders/${order.id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ auditNote: note.trim() || undefined, acknowledgedOverCap: overCap ? ack : undefined }),
    });
    setBusy(false);
    if (!res.ok) {
      // The server is the real gate: show its reason (422 lists the failing components).
      const found = res.data?.error?.details?.blockers;
      const names = Array.isArray(found) ? found.map((b) => `${b.name} (${b.reason})`).join(', ') : '';
      setMsg({ kind: 'alert', text: `${res.data?.error?.message || 'Approval refused.'} ${names}`.trim() });
      await loadOrder(order.id);
      return;
    }
    setMsg({ kind: 'flash', text: `Batch ${order.orderNo} approved and sent to the sewing queue.` });
    back();
  }

  const reasonError = reasonTouched && !reason.trim() ? 'A rejection reason is required.' : '';

  async function reject() {
    setReasonTouched(true);
    if (!reason.trim()) return;
    setBusy(true);
    const res = await api(`/api/verification/orders/${order.id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ rejectionNote: reason.trim() }),
    });
    setBusy(false);
    if (!res.ok) {
      setMsg({ kind: 'alert', text: res.data?.error?.message || 'Could not reject.' });
      return;
    }
    setMsg({ kind: 'flash', text: `Batch ${order.orderNo} rejected and returned to the supervisor.` });
    back();
  }

  const banner = msg.text && (
    <p className={msg.kind === 'flash' ? 'vf-flash' : 'vf-alert'} role={msg.kind === 'flash' ? 'status' : 'alert'}>
      {msg.text}
    </p>
  );

  // ---------- list view ----------
  if (!openId || !order) {
    return (
      <div className="vf-wrap">
        {banner}
        <section aria-labelledby="vf-pending">
          <h2 id="vf-pending">Pending batches</h2>
          {list.length === 0 && <p>No batches are waiting for verification.</p>}
          <ul className="vf-list">
            {list.map((o) => (
              <li key={o.id} className="vf-card vf-row">
                <div>
                  <p><strong>{o.orderNo}</strong> {o.targetQty} × {o.recipeName}</p>
                  <p className="vf-meta">Roll {o.fabricRollId} · {o.countedCount} of {o.componentCount} components counted</p>
                </div>
                <button className="vf-btn" onClick={() => open(o.id)}>Open batch</button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    );
  }

  // ---------- batch view ----------
  const capPct = recipe ? Number(recipe.wastageCap) : 0;
  const shownPct = wastage ? Number(wastage.wastagePct) : 0;
  const scale = Math.max(capPct * 2, shownPct, 1);

  return (
    <div className="vf-wrap">
      <button className="vf-btn vf-btn-plain" onClick={back} style={{ width: 'fit-content' }}>← Back to pending batches</button>
      {banner}

      <section className="vf-card" aria-labelledby="vf-title">
        <h2 id="vf-title">{order.orderNo}: {order.targetQty} × {order.recipeName}</h2>
        <p className="vf-meta">Roll {order.fabricRollId} · {Number(order.actualFabricYards)} yd used</p>
      </section>

      <section className="hero-panel vf-gate" aria-label="Gate status">
        <div className="gate-stage"><GateIllustration open={gateOpen} /></div>
        <div className="vf-gate-text">
          <p className="vf-gate-state" aria-live="polite">
            {dirty
              ? 'Gate: save your counts'
              : gateOpen
                ? 'Gate open: ready to approve'
                : `Gate closed: ${blockers.length} component${blockers.length === 1 ? '' : 's'} short or not counted`}
          </p>
          {dirty && <p className="vf-gate-note">The gate only updates after the server checks your saved counts.</p>}
          {!dirty && blockers.length > 0 && (
            <ul className="vf-list-blockers vf-gate-note">
              {blockers.map((b) => (
                <li key={b.name}>{b.name}: {WORDS[b.reason] ?? b.reason}{b.actualQty != null ? ` (${b.actualQty} of ${b.expectedQty})` : ` (0 of ${b.expectedQty} counted)`}</li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section aria-labelledby="vf-components">
        <h2 id="vf-components">Count every component</h2>
        <div className="vf-grid">
          {order.items.map((i) => {
            const p = parsed[i.componentId] ?? {};
            const preview = p.value !== undefined ? previewLight(i.expectedQty, p.value) : dirty ? 'UNCOUNTED' : i.light;
            const variance = p.value !== undefined ? p.value - i.expectedQty : null;
            const id = `count-${i.componentId}`;
            return (
              <article key={i.componentId} className="vf-bundle">
                <h3>{i.name}</h3>
                <p className="vf-nums"><span>Expected <strong>{i.expectedQty}</strong></span>
                  <span>Variance <strong>{variance == null ? '–' : variance > 0 ? `+${variance}` : variance}</strong></span></p>
                <Chip light={preview ?? 'UNCOUNTED'} count={p.value !== undefined ? `${p.value} / ${i.expectedQty}` : null} />
                <div>
                  <label className="vf-label" htmlFor={id}>Counted pieces</label>
                  <input id={id} className="vf-input" type="text" inputMode="numeric" autoComplete="off" placeholder="e.g. 60"
                    value={draft[i.componentId] ?? ''} onChange={(e) => type(i.componentId, e.target.value)}
                    aria-invalid={Boolean(p.error)} aria-describedby={`${id}-err`} />
                  <p id={`${id}-err`} className="vf-error" aria-live="polite">{p.error}</p>
                </div>
              </article>
            );
          })}
        </div>
        <p style={{ marginTop: 16 }}>
          <button className="vf-btn" onClick={saveCounts} disabled={busy || !dirty}>Save counts</button>
        </p>
      </section>

      {wastage && (
        <section className="vf-card" aria-labelledby="vf-wastage">
          <h2 id="vf-wastage">Fabric wastage</h2>
          <p><strong>{shownPct}%</strong> of {capPct}% cap · expected {wastage.expectedYards} yd, used {Number(order.actualFabricYards)} yd</p>
          <div className="vf-meter" role="img" aria-label={`Wastage ${shownPct} percent, cap ${capPct} percent`}>
            <div className="vf-meter-fill" style={{ width: `${Math.min(100, Math.max(0, (shownPct / scale) * 100))}%` }} />
            <div className="vf-meter-cap" style={{ left: `${(capPct / scale) * 100}%` }} />
          </div>
          {overCap && (
            <>
              <p className="vf-warn" role="status">Wastage is over the {capPct}% cap. You may still approve, but you must acknowledge it.</p>
              <label className="vf-check"><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /> I acknowledge the wastage is over the cap</label>
            </>
          )}
        </section>
      )}

      <section className="vf-actions" aria-label="Decision">
        <div className="vf-card">
          <h2>Approve</h2>
          <div>
            <label className="vf-label" htmlFor="audit">Audit note for sewing (optional)</label>
            <textarea id="audit" className="vf-input" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Cuffs slightly high, counted twice" />
          </div>
          <button className="vf-btn" onClick={approve} disabled={busy || !gateOpen || (overCap && !ack)}>Approve batch</button>
          {!gateOpen && <p className="vf-meta">Approve is disabled until every component is counted and none is short.</p>}
        </div>
        <div className="vf-card">
          <h2>Reject</h2>
          <div>
            <label className="vf-label" htmlFor="reason">Reason (required)</label>
            <textarea id="reason" className="vf-input" maxLength={500} value={reason}
              onChange={(e) => { setReason(e.target.value); setReasonTouched(true); }}
              onBlur={() => setReasonTouched(true)}
              aria-invalid={Boolean(reasonError)} aria-describedby="reason-err" placeholder="e.g. Sleeves short by 2 pieces, re-cut needed" />
            <p id="reason-err" className="vf-error" aria-live="polite">{reasonError}</p>
          </div>
          <button className="vf-btn vf-btn-danger" onClick={reject} disabled={busy}>Reject batch</button>
        </div>
      </section>
    </div>
  );
}