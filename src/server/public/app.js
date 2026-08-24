/* Volt & Co. — AI Buyer demo client. */
'use strict';

const $ = (sel) => document.querySelector(sel);
const state = {
  sessionId: null,
  meta: null,
  products: [],
  es: null,
  order: null,
  lastToolEl: null,
};

/* ── utils ──────────────────────────────────────────────────────────── */

async function fetchJSON(url, opts) {
  const res = await fetch(url, opts);
  const ct = res.headers.get('content-type') || '';
  if (!res.ok) {
    let msg = `${res.status}`;
    try { msg = (await res.json()).error || msg; } catch { /* ignore */ }
    throw new Error(msg);
  }
  return ct.includes('json') ? res.json() : res.text();
}

const fmt = (paise) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
    .format(paise / 100);

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function toast(msg, kind = '') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.innerHTML = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

function setState(s) {
  const b = $('#badge-state');
  b.textContent = s;
  b.className = `badge badge-state ${s}`;
}

function addMsg(kind, html, cls = '') {
  const feed = $('#console-feed');
  const el = document.createElement('div');
  el.className = `msg ${kind} ${cls}`.trim();
  el.innerHTML = html;
  feed.appendChild(el);
  feed.scrollTop = feed.scrollHeight;
  return el;
}

/* ── boot ───────────────────────────────────────────────────────────── */

async function init() {
  const [meta, cat] = await Promise.all([fetchJSON('/api/meta'), fetchJSON('/api/catalog')]);
  state.meta = meta;
  state.products = cat.products;
  renderBadges();
  renderChips();
  renderCatalog();

  const sid = sessionStorage.getItem('sessionId');
  if (sid) {
    try {
      const snap = await fetchJSON(`/api/sessions/${sid}`);
      if (snap && snap.id) {
        state.sessionId = sid;
        connect(sid);
        renderSnapshot(snap);
        bind();
        return;
      }
    } catch { /* fall through to new session */ }
  }
  await newSession();
  bind();
}

function renderBadges() {
  $('#badge-planner').textContent = state.meta.hasLlm ? `planner: LLM · ${state.meta.llmModel}` : 'planner: heuristic (offline)';
  $('#badge-payment').textContent = state.meta.hasRazorpay ? 'payments: Razorpay test API' : 'payments: mock';
  const g = state.meta.guardLimits;
  $('#badge-guard').textContent = `guard: ₹${g.maxOrderAmountInr.toLocaleString('en-IN')} cap · qty≤${g.maxQtyPerLine} · ${g.maxLineItems} lines`;
  // The seeded-failure toggle only applies to the mock provider.
  const toggle = $('#fail-toggle');
  toggle.disabled = state.meta.hasRazorpay;
  toggle.closest('.toggle').title = state.meta.hasRazorpay
    ? 'Seeded-failure demo only applies to the mock provider (real Razorpay is active).'
    : 'Makes the mock payment provider fail once, then recover — demonstrates graceful failure handling';
  toggle.closest('.toggle').style.opacity = state.meta.hasRazorpay ? 0.5 : 1;
}

function renderChips() {
  const wrap = $('#mission-chips');
  wrap.innerHTML = '';
  state.meta.missions.forEach((m) => {
    const c = document.createElement('button');
    c.className = 'chip';
    c.textContent = m;
    c.onclick = () => { $('#mission-input').value = m; };
    wrap.appendChild(c);
  });
}

function renderCatalog() {
  const grid = $('#product-grid');
  grid.innerHTML = '';
  state.products.forEach((p) => {
    const out = p.stock <= 0;
    const card = document.createElement('div');
    card.className = `product-card${out ? ' out' : ''}`;
    card.innerHTML = `
      <div class="p-cat">${esc(p.category)} · ${esc(p.brand)}</div>
      <div class="p-name">${esc(p.name)}</div>
      <div class="p-desc">${esc(p.description)}</div>
      <div class="tag-row">${p.tags.slice(0, 5).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>
      <div class="p-meta">
        <span class="p-price">${fmt(p.pricePaise)}</span>
        <span class="p-stock ${p.stock < 10 ? 'low' : ''}">${p.stock > 0 ? `${p.stock} in stock` : 'out of stock'}</span>
      </div>`;
    card.title = `id: ${p.id} · agent-readable via /api/catalog/agent`;
    grid.appendChild(card);
  });
}

/* ── sessions ────────────────────────────────────────────────────────── */

async function newSession() {
  if (state.es) state.es.close();
  const fail = $('#fail-toggle').checked;
  const res = await fetchJSON('/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ demoFailOnce: fail }),
  });
  state.sessionId = res.sessionId;
  sessionStorage.setItem('sessionId', res.sessionId);
  $('#session-label').textContent = `session ${state.sessionId}`;
  state.order = null;
  state.lastToolEl = null;
  resetConsole();
  resetOrderArea();
  resetAudit();
  setState('idle');
  connect(state.sessionId);
  addMsg('thinking', `New session <span class="mono">${state.sessionId}</span> ready. Enter a mission and press <b>Run AI buyer</b>.`);
}

function connect(id) {
  if (state.es) state.es.close();
  const es = new EventSource(`/api/sessions/${id}/events`);
  state.es = es;
  es.onmessage = (ev) => {
    let e;
    try { e = JSON.parse(ev.data); } catch { return; }
    handleEvent(e);
  };
}

/* ── event handling ──────────────────────────────────────────────────── */

let lastAuditFetch = 0;
function refreshAudit() {
  const now = Date.now();
  if (now - lastAuditFetch < 250) return;
  lastAuditFetch = now;
  fetchJSON(`/api/sessions/${state.sessionId}/audit`)
    .then((d) => renderAudit(d.entries))
    .catch(() => {});
}

function handleEvent(e) {
  switch (e.type) {
    case 'agent.thinking':
      addMsg('thinking', esc(e.data?.text));
      break;
    case 'agent.message':
      addMsg('agent', `<span class="who">agent</span>${esc(e.data?.text)}`);
      break;
    case 'agent.tool_call': {
      const d = e.data || {};
      const cls = d.name.includes('propose') ? 'propose' : d.name.includes('search') ? 'search' : 'cart';
      const el = addMsg('tool', `
        <div><span class="tool-name">${esc(d.name)}</span> <span class="args">${esc(JSON.stringify(d.args))}</span></div>
        ${d.reasoning ? `<div class="reason">"${esc(d.reasoning)}"</div>` : ''}
        <div class="tool-out"></div>`, cls);
      state.lastToolEl = el;
      break;
    }
    case 'agent.tool_result': {
      if (state.lastToolEl) {
        const out = state.lastToolEl.querySelector('.tool-out');
        if (out && e.data?.out) {
          out.textContent = e.data.out;
          out.style.whiteSpace = 'pre-wrap';
        }
      }
      break;
    }
    case 'cart.updated':
      renderCart(e.data?.cart);
      break;
    case 'guard.blocked':
      addMsg('warn', `🛡 Guard blocked: <b>${esc(e.data?.reason)}</b>`);
      break;
    case 'order.pending_approval':
      state.order = e.data?.order;
      renderOrder(e.data?.order, e.data?.guardChecks);
      setState('awaiting_approval');
      break;
    case 'order.approved':
      addMsg('info', `✅ Order <span class="mono">${esc(e.data?.order?.id)}</span> approved by human — initiating payment…`);
      setState('paying');
      break;
    case 'order.denied':
      addMsg('warn', `⛔ Order denied by human${e.data?.reason ? ` — <i>${esc(e.data.reason)}</i>` : ''}.`);
      renderDenied();
      setState('running');
      break;
    case 'payment.initiated':
      addMsg('thinking', `Initiating ${esc(e.data?.provider)} payment via <b>${esc(e.data?.method)}</b> (attempt ${e.data?.attempt})…`);
      break;
    case 'payment.succeeded':
      addMsg('ok', `💚 Payment succeeded (attempt ${e.data?.attempt}) — order <b>${esc(e.data?.order?.id)}</b> paid.`);
      renderPayment(e.data?.payment, e.data?.order, true);
      setState('complete');
      break;
    case 'payment.link_created':
      addMsg('ok', `🔗 Payment link created via <b>${esc(e.data?.payment?.provider)}</b> — awaiting completion (webhook in production).`);
      renderPayment(e.data?.payment, e.data?.order, true);
      setState('complete');
      break;
    case 'receipt.sent':
      addMsg('ok', `🧾 Receipt emailed to <b>${esc(e.data?.to)}</b> · <span class="mono">${esc(e.data?.messageId)}</span>`);
      renderReceipt(e.data);
      break;
    case 'payment.failed':
      addMsg('err', `💔 Payment failed (${esc(e.data?.method)}, attempt ${e.data?.attempt}): <b>${esc(e.data?.error)}</b>`);
      if (e.data?.attempt === 1) {
        addMsg('thinking', '↻ Graceful recovery: retrying once with a fallback payment method…');
      }
      break;
    case 'session.ended':
      if (e.data?.state === 'failed') setState('failed');
      else if (e.data?.state === 'complete') setState('complete');
      break;
    default:
      break;
  }
  refreshAudit();
}

/* ── renderers ───────────────────────────────────────────────────────── */

function resetConsole() {
  $('#console-feed').innerHTML = '';
}
function resetOrderArea() {
  $('#order-area').innerHTML = '<div class="empty-note">No order yet. Run the AI buyer to see a gated checkout.</div>';
}
function resetAudit() {
  $('#audit-list').innerHTML = '<div class="empty-note">Nothing yet — every money action will appear here with reasoning &amp; guard checks.</div>';
  $('#audit-count').textContent = '';
}

function renderCart(cart) {
  if (!cart) return;
  const box = document.createElement('div');
  box.className = 'cart-box';
  const lines = cart.lines.length
    ? cart.lines.map((l) => `
        <div class="cart-line"><span>${esc(l.name)} <span class="qty">×${l.qty}</span></span><span>${fmt(l.unitPricePaise * l.qty)}</span></div>`).join('')
    : '<div class="empty-note" style="border:none;padding:6px">Cart is empty.</div>';
  box.innerHTML = `${lines}<div class="cart-total"><span>Subtotal</span><span>${fmt(cart.totalPaise)}</span></div>`;
  const area = $('#order-area');
  // Replace an existing cart-box but keep order/payment cards below.
  const existing = area.querySelector('.cart-box');
  if (existing) existing.replaceWith(box);
  else area.prepend(box);
}

function renderOrder(order, checks) {
  const area = $('#order-area');
  const lines = order.lines.map((l) =>
    `<div class="row"><span>${esc(l.name)} ×${l.qty}</span><span>${fmt(l.unitPricePaise * l.qty)}</span></div>`).join('');
  const card = document.createElement('div');
  card.className = 'order-card';
  card.id = 'order-card';
  card.innerHTML = `
    <h3>💳 Order ${esc(order.id)} — awaiting approval</h3>
    ${lines}
    <div class="row"><span>Shipping</span><span>${order.shippingPaise ? fmt(order.shippingPaise) : 'FREE'}</span></div>
    <div class="row total"><span>Total</span><span>${fmt(order.totalPaise)}</span></div>
    <div class="mono muted" style="font-size:11px;margin-top:6px">guard: ${(checks || []).map((c) => '✓ ' + esc(c)).join(' · ')}</div>
    <div class="order-actions">
      <button class="btn approve" data-act="approve">Approve charge</button>
      <button class="btn deny" data-act="deny">Deny</button>
    </div>`;
  const existing = area.querySelector('.order-card');
  if (existing) existing.replaceWith(card);
  else area.appendChild(card);
  renderCart({ lines: order.lines, totalPaise: order.subtotalPaise });
}

function renderDenied() {
  const area = $('#order-area');
  const card = area.querySelector('.order-card');
  if (card) {
    card.innerHTML = `
      <h3>⛔ Order denied</h3>
      <div class="order-actions">
        <button class="btn continue" data-act="continue">Let agent adjust & re-propose</button>
      </div>`;
  }
}

function renderPayment(payment, order, ok) {
  const area = $('#order-area');
  const el = document.createElement('div');
  el.className = `payment-result ${ok ? 'ok' : 'err'}`;
  const paid = ok && !!payment?.paidAt;
  const headline = paid
    ? `Paid ${fmt(order?.totalPaise)} via ${esc(payment?.provider)}`
    : ok
      ? `Payment link created — ${fmt(order?.totalPaise)} via ${esc(payment?.provider)}`
      : `Payment failed (${esc(payment?.error)})`;
  const details = [
    headline,
    payment?.paymentId ? `<div class="pay-id">payment: ${esc(payment.paymentId)}</div>` : '',
    payment?.rzpOrderId ? `<div class="pay-id">razorpay order: ${esc(payment.rzpOrderId)}</div>` : '',
    payment?.paymentLinkUrl ? `<div class="pay-id">link: <a href="${esc(payment.paymentLinkUrl)}" target="_blank">${esc(payment.paymentLinkUrl)}</a></div>` : '',
  ].filter(Boolean).join('');
  el.innerHTML = details;
  area.appendChild(el);
}

function renderReceipt(data) {
  const area = $('#order-area');
  const el = document.createElement('div');
  el.className = 'receipt-card';
  const paid = data?.paid ? 'Paid' : 'Payment link created';
  el.innerHTML = `
    <div class="r-head">🧾 Receipt <span class="r-amt">${fmt(data?.totalPaise)}</span></div>
    <div class="r-row"><span>Order</span><span class="mono">${esc(data?.orderId)}</span></div>
    <div class="r-row"><span>Status</span><span>${paid}</span></div>
    <div class="r-row"><span>Delivered to</span><span>${esc(data?.to)}</span></div>
    <div class="r-row"><span>Message</span><span class="mono">${esc(data?.messageId)}</span></div>`;
  area.appendChild(el);
}

function renderAudit(entries) {
  const list = $('#audit-list');
  if (!entries || !entries.length) {
    list.innerHTML = '<div class="empty-note">Nothing yet — every money action will appear here with reasoning &amp; guard checks.</div>';
    $('#audit-count').textContent = '';
    return;
  }
  $('#audit-count').textContent = `${entries.length} entries`;
  list.innerHTML = entries.map((a) => {
    const kind = ['PAYMENT', 'ORDER_APPROVED'].some((k) => a.type.startsWith(k)) ? 'aud-mny'
      : a.type.includes('GUARD') ? 'aud-guard'
      : ['PAYMENT_FAILED'].some((k) => a.type.includes(k)) ? 'aud-err' : 'aud-gate';
    return `<div class="audit-item ${kind}">
      <div class="a-head"><span class="a-type">${esc(a.type)}</span>
        <span>#${a.seq} · ${esc(a.actor)}${a.amountPaise ? ` · <span class="a-amt">${fmt(a.amountPaise)}</span>` : ''}</span></div>
      <div class="a-reason">${esc(a.reasoning)}</div>
      ${a.guardChecks?.length ? `<div class="a-checks">✓ ${a.guardChecks.join(' · ')}</div>` : ''}
      ${a.blockedReason ? `<div class="a-checks" style="color:var(--amber)">⛔ ${esc(a.blockedReason)}</div>` : ''}
      ${a.detail ? `<div class="a-checks">${esc(a.detail)}</div>` : ''}
    </div>`;
  }).join('');
}

function renderSnapshot(snap) {
  if (snap.mission) $('#mission-input').value = snap.mission;
  if (snap.cart) renderCart(snap.cart);
  if (snap.order) {
    if (snap.order.status === 'pending_approval') {
      renderOrder(snap.order);
      setState('awaiting_approval');
    } else if (snap.order.status === 'paid' || snap.order.status === 'payment_initiated') {
      state.order = snap.order;
      if (snap.order.payment) renderPayment(snap.order.payment, snap.order, true);
      setState('complete');
    }
  }
  if (snap.auditCount) refreshAudit();
  $('#session-label').textContent = `session ${snap.id}`;
}

/* ── actions ─────────────────────────────────────────────────────────── */

async function runMission() {
  const mission = $('#mission-input').value.trim();
  if (!mission) { toast('Enter a mission first', 'err'); return; }
  if (!state.sessionId) await newSession();
  try {
    const res = await fetchJSON(`/api/sessions/${state.sessionId}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mission }),
    });
    if (res.error) { toast(esc(res.error), 'err'); return; }
    resetConsole();
    addMsg('thinking', `▶ Running mission: <b>${esc(mission)}</b>`);
    setState('running');
  } catch (err) {
    toast(esc(err.message), 'err');
  }
}

async function act(act, reason) {
  if (!state.sessionId) return;
  try {
    await fetchJSON(`/api/sessions/${state.sessionId}/${act}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
  } catch (err) {
    toast(esc(err.message), 'err');
  }
}

function bind() {
  $('#run-btn').onclick = runMission;
  $('#reset-btn').onclick = () => { sessionStorage.removeItem('sessionId'); newSession(); };
  $('#mission-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') runMission(); });

  $('#order-area').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const action = btn.dataset.act;
    if (action === 'approve') {
      act('approve', 'Approved in the demo UI');
      toast('Approving charge…', 'ok');
    } else if (action === 'deny') {
      const reason = window.prompt('Reason for denying (fed back to the agent):', 'Too expensive — reduce the total.');
      if (reason !== null) act('deny', reason || 'Denied by human');
    } else if (action === 'continue') {
      const reason = 'Too expensive — adjust the cart and re-propose.';
      act('continue', reason);
      addMsg('thinking', '↻ Asking the agent to adjust and re-propose…');
      setState('running');
    }
  });

  $('#audit-download').addEventListener('click', (e) => {
    e.preventDefault();
    if (state.sessionId) window.location.href = `/api/sessions/${state.sessionId}/audit/download`;
  });
}

init();
