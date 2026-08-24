import path from 'node:path';
import express from 'express';
import type { Request, Response } from 'express';
import { CatalogService } from '../catalog/catalog.js';
import {
  agentManifest,
  compactCatalog,
  llmsTxt,
  productJsonLd,
} from '../catalog/serialize.js';
import { config, hasLlm } from '../config.js';
import { SessionManager } from './sessionManager.js';

export function createApp(manager: SessionManager): express.Express {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(process.cwd(), 'src/server/public')));

  const catalog = new CatalogService();

  /* ── merchant / agent-readable catalog ──────────────────────────────── */

  app.get('/api/meta', (_req, res) => {
    res.json({
      ...manager.meta(),
      llmModel: hasLlm() ? config.llm.model : null,
      guardLimits: {
        maxOrderAmountInr: config.guards.maxOrderAmountPaise / 100,
        maxQtyPerLine: config.guards.maxQtyPerLine,
        maxLineItems: config.guards.maxLineItems,
      },
      missions: [
        'Buy me a good mechanical keyboard under ₹5,000',
        'Get a wireless mouse and an extended desk mat for my new setup',
        "I need noise-cancelling headphones for travel, budget around ₹9,000",
        'Set up a video-call kit: a 1080p webcam and a braided USB-C cable',
        'A 27-inch monitor for work — stay under ₹22,000',
      ],
    });
  });

  // Compact agent-readable catalog (primary payload for tool-calling agents).
  app.get('/api/catalog/agent', (_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.json(compactCatalog(catalog.buyable()));
  });

  // Human-friendly storefront catalog (same data, friendlier shape for the UI).
  app.get('/api/catalog', (_req, res) => {
    res.json({
      merchant: catalog.merchantInfo(),
      products: catalog.all(),
    });
  });

  app.get('/api/catalog/llms.txt', (_req, res) => {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(llmsTxt(catalog.all()));
  });

  // Schema.org JSON-LD product page.
  app.get('/api/catalog/products/:id', (req, res) => {
    const p = catalog.byId(req.params.id);
    if (!p) return res.status(404).json({ error: 'Product not found' });
    res.setHeader('Content-Type', 'application/ld+json');
    res.json(productJsonLd(p));
  });

  app.get('/agent.json', (_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.json(agentManifest());
  });

  /* ── sessions ───────────────────────────────────────────────────────── */

  app.post('/api/sessions', (req, res) => {
    const body = (req.body ?? {}) as { demoFailOnce?: boolean; paymentMethods?: string[] };
    const session = manager.createSession({
      demoFailOnce: body.demoFailOnce !== false,
      paymentMethods: body.paymentMethods,
    });
    res.status(201).json({ sessionId: session.id });
  });

  app.get('/api/sessions/:id', (req, res) => {
    const s = manager.get(req.params.id);
    if (!s) return res.status(404).json({ error: 'Session not found' });
    res.json({
      id: s.id,
      traceId: s.traceId,
      state: s.state,
      mission: s.mission,
      provider: s.payment.provider,
      cart: s.cartSnapshot(),
      order: s.order,
      auditCount: s.audit.count(),
    });
  });

  app.post('/api/sessions/:id/run', (req, res) => {
    const s = manager.get(req.params.id);
    if (!s) return res.status(404).json({ error: 'Session not found' });
    const mission = (req.body?.mission as string) ?? '';
    if (!mission.trim()) return res.status(400).json({ error: 'mission is required' });
    const started = manager.run(s.id, mission.trim());
    if (!started) return res.status(409).json({ error: 'Session is already running or awaiting approval' });
    res.json({ ok: true, state: s.state });
  });

  app.post('/api/sessions/:id/approve', async (req, res) => {
    const s = manager.get(req.params.id);
    if (!s) return res.status(404).json({ error: 'Session not found' });
    const result = await s.approveOrder((req.body?.reason as string) || undefined);
    res.json(result);
  });

  app.post('/api/sessions/:id/deny', (req, res) => {
    const s = manager.get(req.params.id);
    if (!s) return res.status(404).json({ error: 'Session not found' });
    const reason = (req.body?.reason as string) || 'No reason given';
    res.json(s.denyOrder(reason));
  });

  // After a denial, tell the agent to adjust and re-propose.
  app.post('/api/sessions/:id/continue', (req, res) => {
    const s = manager.get(req.params.id);
    if (!s) return res.status(404).json({ error: 'Session not found' });
    const reason = (req.body?.reason as string) || 'No reason given';
    const ok = manager.continueAfterDenial(s.id, reason);
    res.json({ ok, state: s.state });
  });

  /* ── audit trail ────────────────────────────────────────────────────── */

  app.get('/api/sessions/:id/audit', (req, res) => {
    const s = manager.get(req.params.id);
    if (!s) return res.status(404).json({ error: 'Session not found' });
    res.json(s.audit.export());
  });

  app.get('/api/sessions/:id/audit/download', (req, res) => {
    const s = manager.get(req.params.id);
    if (!s) return res.status(404).json({ error: 'Session not found' });
    const lines = s.audit.all().map((e) => JSON.stringify(e)).join('\n');
    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Content-Disposition', `attachment; filename="audit-${s.traceId}.jsonl"`);
    res.send(lines);
  });

  /* ── live events (SSE) ──────────────────────────────────────────────── */

  app.get('/api/sessions/:id/events', (req: Request<{ id: string }>, res: Response) => {
    const s = manager.get(req.params.id);
    if (!s) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write(': connected\n\n');
    const send = (e: unknown) => res.write(`data: ${JSON.stringify(e)}\n\n`);
    const unsub = s.subscribe(send);
    const heartbeat = setInterval(() => res.write(': hb\n\n'), 15000);
    req.on('close', () => {
      clearInterval(heartbeat);
      unsub();
    });
  });

  return app;
}
