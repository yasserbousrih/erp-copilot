const express = require('express');
const { z } = require('zod');
const CopilotEngine = require('../services/copilotEngine');
const FrappeClient = require('../client/frappeClient');

const router = express.Router();
const engine = new CopilotEngine();
const turnSchema = z.object({ message: z.string().trim().min(1), tenantId: z.string().optional(), conversationId: z.string().optional(), doctypeContext: z.string().optional() });

router.post('/turn', async (req, res, next) => {
  const parsed = turnSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
  try { return res.json(await engine.turn(parsed.data)); } catch (error) { return next(error); }
});

router.get('/schema/:doctype', async (req, res, next) => {
  try { return res.json({ doctype: req.params.doctype, schema: await new FrappeClient().getMeta(req.params.doctype) }); } catch (error) { return next(error); }
});

router.get('/health', (req, res) => res.json({ status: 'healthy', service: 'erp-copilot' }));

module.exports = router;
