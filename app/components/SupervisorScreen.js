'use client';

import { useCallback, useEffect, useState } from 'react';
import '../supervisor.css';
import { expectedPieces } from '../../lib/domain/multiplier.js';
import { parseWholeNumber } from '../../lib/validation/wholeNumber.js';

const STATUSES = [
  {
    key: 'CUTTING_IN_PROGRESS',
    label: 'Cutting in progress',
    glyph: '○',
  },
  {
    key: 'PENDING_VERIFICATION',
    label: 'Pending verification',
    glyph: '◐',
  },
  {
    key: 'REJECTED',
    label: 'Rejected',
    glyph: '✕',
  },
  {
    key: 'VERIFIED',
    label: 'Verified',
    glyph: '✓',
  },
  {
    key: 'SEWING_STARTED',
    label: 'Sewing started',
    glyph: '▶',
  },
];

const EMPTY = {
  recipeCode: '',
  targetQty: '',
  fabricRollId: '',
  actualFabricYards: '',
};

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  let data = null;

  try {
    data = await res.json();
  } catch {
    // empty body
  }

  return {
    ok: res.ok,
    status: res.status,
    data,
  };
}

export default function SupervisorScreen() {
  const [recipes, setRecipes] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loadError, setLoadError] = useState('');

  const [values, setValues] = useState(EMPTY);
  const [touched, setTouched] = useState({});
  const [serverErrors, setServerErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [flash, setFlash] = useState('');

  const [saving, setSaving] = useState(false);
  const [rowBusy, setRowBusy] = useState('');
  const [rowError, setRowError] = useState({});

  const loadAll = useCallback(async () => {
    const [r, o] = await Promise.all([
      api('/api/recipes'),
      api('/api/orders'),
    ]);

    if (!r.ok || !o.ok) {
      setLoadError(
        o.data?.error?.message ||
        r.data?.error?.message ||
        'Could not load data. Sign in again.',
      );
      return;
    }

    setLoadError('');
    setRecipes(r.data.recipes);
    setOrders(o.data.orders);
  }, []);

  useEffect(() => {
// eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount: state is set only after the request starts
    loadAll();
  }, [loadAll]);

  const recipe = recipes.find(
    (x) => x.recipeCode === values.recipeCode,
  );

  const qty = parseWholeNumber(values.targetQty, {
    label: 'Garments',
    max: 100000,
  });

  const yards = parseWholeNumber(values.actualFabricYards, {
    label: 'Fabric yards',
    max: 1000000,
  });

  const roll = values.fabricRollId.trim();

  const clientErrors = {
    recipeCode: values.recipeCode
      ? null
      : 'Choose a recipe.',

    targetQty: qty.error ?? null,

    fabricRollId: !roll
      ? 'Fabric roll ID is required.'
      : roll.length > 60
        ? 'Fabric roll ID is too long (60 characters max).'
        : null,

    actualFabricYards: yards.error ?? null,
  };

  const shown = (field) =>
    (touched[field] ? clientErrors[field] : null) ||
    serverErrors[field] ||
    null;

  function change(field, text) {
    setValues((v) => ({
      ...v,
      [field]: text,
    }));

    setTouched((t) => ({
      ...t,
      [field]: true,
    }));

    setServerErrors((s) => ({
      ...s,
      [field]: null,
    }));

    setFlash('');
  }

  function blur(field) {
    setTouched((t) => ({
      ...t,
      [field]: true,
    }));
  }

  async function onSubmit(e) {
    e.preventDefault();

    setTouched({
      recipeCode: true,
      targetQty: true,
      fabricRollId: true,
      actualFabricYards: true,
    });

    if (Object.values(clientErrors).some(Boolean)) {
      return;
    }

    setSaving(true);
    setFormError('');
    setFlash('');

    const res = await api('/api/orders', {
      method: 'POST',
      body: JSON.stringify({
        recipeCode: values.recipeCode,
        targetQty: qty.value,
        fabricRollId: roll,
        actualFabricYards: yards.value,
      }),
    });

    setSaving(false);

    if (!res.ok) {
      const details = res.data?.error?.details;

      if (details && typeof details === 'object') {
        const next = {};

        for (const [field, msgs] of Object.entries(details)) {
          next[field] = Array.isArray(msgs)
            ? msgs[0]
            : String(msgs);
        }

        setServerErrors(next);
      }

      setFormError(
        res.data?.error?.message ||
        'Could not create the order.',
      );

      return;
    }

    setValues(EMPTY);
    setTouched({});

    setFlash(
      `Order ${res.data?.order?.orderNo ?? ''} created. Submit it to QC when the cut is finished.`,
    );

    await loadAll();
  }

  async function act(order, kind) {
    setRowBusy(order.id);

    setRowError((r) => ({
      ...r,
      [order.id]: '',
    }));

    const res = await api(
      `/api/orders/${order.id}/${kind}`,
      {
        method: 'POST',
        body: '{}',
      },
    );

    setRowBusy('');

    if (!res.ok) {
      setRowError((r) => ({
        ...r,
        [order.id]:
          res.data?.error?.message ||
          'That did not work.',
      }));

      return;
    }

    await loadAll();
  }

  const stdHundredths = recipe
    ? Math.round(Number(recipe.stdFabricYards) * 100)
    : 0;

  const expectedYards = qty.value
    ? ((qty.value * stdHundredths) / 100).toFixed(2)
    : null;

  return (
    <div className="sv-wrap">
      {loadError && (
        <p className="sv-alert" role="alert">
          {loadError}
        </p>
      )}

      <section aria-labelledby="sv-progress">
        <h2 id="sv-progress">Orders by status</h2>

        <ol className="sv-strip">
          {STATUSES.map((s) => (
            <li
              key={s.key}
              className="sv-step"
            >
              <span>
                <span aria-hidden="true">
                  {s.glyph}{' '}
                </span>
                {s.label}
              </span>

              <strong>
                {
                  orders.filter(
                    (o) => o.status === s.key,
                  ).length
                }
              </strong>
            </li>
          ))}
        </ol>
      </section>

      <section
        className="sv-card"
        aria-labelledby="sv-new"
      >
        <h2 id="sv-new">
          New cutting order
        </h2>

        <form
          className="sv-form"
          onSubmit={onSubmit}
          noValidate
        >
          <div className="sv-field">
            <label htmlFor="recipe">
              Recipe
            </label>

            <select
              id="recipe"
              className="sv-input"
              value={values.recipeCode}
              onChange={(e) =>
                change(
                  'recipeCode',
                  e.target.value,
                )
              }
              onBlur={() =>
                blur('recipeCode')
              }
              aria-invalid={Boolean(
                shown('recipeCode'),
              )}
              aria-describedby="recipe-err"
            >
              <option value="">
                Choose a recipe
              </option>

              {recipes.map((r) => (
                <option
                  key={r.recipeCode}
                  value={r.recipeCode}
                >
                  {r.recipeCode} - {r.name}
                </option>
              ))}
            </select>

            <p
              id="recipe-err"
              className="sv-error"
              aria-live="polite"
            >
              {shown('recipeCode')}
            </p>
          </div>

          <div className="sv-field">
            <label htmlFor="qty">
              Garments to cut
            </label>

            <input
              id="qty"
              className="sv-input"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="e.g. 50"
              value={values.targetQty}
              onChange={(e) =>
                change(
                  'targetQty',
                  e.target.value,
                )
              }
              onBlur={() => blur('targetQty')}
              aria-invalid={Boolean(
                shown('targetQty'),
              )}
              aria-describedby="qty-err"
            />

            <p
              id="qty-err"
              className="sv-error"
              aria-live="polite"
            >
              {shown('targetQty')}
            </p>
          </div>

          {recipe && qty.value && (
            <div
              className="sv-preview"
              aria-live="polite"
            >
              <strong>Expected pieces</strong>

              <ul>
                {recipe.components.map((c) => (
                  <li key={c.name}>
                    {qty.value} garments ×{' '}
                    {c.piecesPerGarment}{' '}
                    {c.name} ={' '}
                    {expectedPieces(
                      qty.value,
                      c.piecesPerGarment,
                    )}{' '}
                    pieces expected
                  </li>
                ))}
              </ul>

              <p>
                Expected fabric:{' '}
                {qty.value} ×{' '}
                {recipe.stdFabricYards} yd ={' '}
                {expectedYards} yd
                {' '}
                (cap {recipe.wastageCap}%)
              </p>
            </div>
          )}

          <div className="sv-field">
            <label htmlFor="roll">
              Fabric roll ID
            </label>

            <input
              id="roll"
              className="sv-input"
              type="text"
              autoComplete="off"
              placeholder="e.g. FAB-ROLL-910"
              value={values.fabricRollId}
              onChange={(e) =>
                change(
                  'fabricRollId',
                  e.target.value,
                )
              }
              onBlur={() =>
                blur('fabricRollId')
              }
              aria-invalid={Boolean(
                shown('fabricRollId'),
              )}
              aria-describedby="roll-err"
            />

            <p
              id="roll-err"
              className="sv-error"
              aria-live="polite"
            >
              {shown('fabricRollId')}
            </p>
          </div>

          <div className="sv-field">
            <label htmlFor="yards">
              Actual fabric used (whole yards)
            </label>

            <input
              id="yards"
              className="sv-input"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="e.g. 94"
              value={values.actualFabricYards}
              onChange={(e) =>
                change(
                  'actualFabricYards',
                  e.target.value,
                )
              }
              onBlur={() =>
                blur('actualFabricYards')
              }
              aria-invalid={Boolean(
                shown('actualFabricYards'),
              )}
              aria-describedby="yards-err"
            />

            <p
              id="yards-err"
              className="sv-error"
              aria-live="polite"
            >
              {shown('actualFabricYards')}
            </p>
          </div>

          {formError && (
            <p className="sv-alert" role="alert">
              {formError}
            </p>
          )}

          {flash && (
            <p className="sv-flash" role="status">
              {flash}
            </p>
          )}

          <button
            className="sv-btn"
            type="submit"
            disabled={saving}
          >
            {saving
              ? 'Creating...'
              : 'Create order'}
          </button>
        </form>
      </section>

      <section aria-labelledby="sv-orders">
        <h2 id="sv-orders">
          All orders
        </h2>

        {orders.length === 0 && !loadError && (
          <p>No orders yet.</p>
        )}

        {STATUSES.map((s) => {
          const group = orders.filter(
            (o) => o.status === s.key,
          );

          if (group.length === 0) {
            return null;
          }

          return (
            <div key={s.key}>
              <h3>
                <span aria-hidden="true">
                  {s.glyph}{' '}
                </span>
                {s.label} ({group.length})
              </h3>

              <ul className="sv-list">
                {group.map((o) => (
                  <li
                    key={o.id}
                    className="sv-card sv-order"
                  >
                    <div>
                      <p>
                        <strong>
                          {o.orderNo}
                        </strong>{' '}
                        <span
                          className={`sv-chip sv-chip-${o.status}`}
                        >
                          {s.label}
                        </span>
                      </p>

                      <p>
                        {o.targetQty} ×{' '}
                        {o.recipeName} (
                        {o.recipeCode})
                      </p>

                      <p className="sv-meta">
                        Roll {o.fabricRollId} ·{' '}
                        {Number(
                          o.actualFabricYards,
                        )}{' '}
                        yd used
                      </p>

                      {rowError[o.id] && (
                        <p
                          className="sv-error"
                          role="alert"
                        >
                          {rowError[o.id]}
                        </p>
                      )}
                    </div>

                    {o.status ===
                      'CUTTING_IN_PROGRESS' && (
                      <button
                        className="sv-btn"
                        disabled={
                          rowBusy === o.id
                        }
                        onClick={() =>
                          act(o, 'submit')
                        }
                      >
                        Submit to QC
                      </button>
                    )}

                    {o.status === 'REJECTED' && (
                      <button
                        className="sv-btn sv-btn-accent"
                        disabled={
                          rowBusy === o.id
                        }
                        onClick={() =>
                          act(o, 'resubmit')
                        }
                      >
                        Resubmit after re-cut
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </section>
    </div>
  );
}