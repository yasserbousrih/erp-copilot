const express = require('express');
const { z } = require('zod');
const CopilotEngine = require('../services/copilotEngine');
const FrappeClient = require('../client/frappeClient');
const { definitions, executeTool } = require('../tools/frappeTools');
const auditLogger = require('../services/auditLogger');

const router = express.Router();
const engine = new CopilotEngine();
const turnSchema = z.object({ message: z.string().trim().min(1), tenantId: z.string().optional(), conversationId: z.string().optional(), doctypeContext: z.string().optional() });

const exportOpenAi = (req, res) => res.json({ data: definitions });
const audit = (req, res) => res.json({ data: auditLogger.getEntries(req.query) });
const invoke = async (req, res) => {
  const { workflow_key: workflowKey, name, params, args } = req.body || {};
  const toolName = name || workflowKey;
  const toolArgs = params ?? args ?? {};
  const context = req.body?.context || {};
  if (req.headers['x-read-only'] === 'true') {
    context.readOnly = true;
  }
  try {
    return res.json({ success: true, result: await executeTool(toolName, toolArgs, undefined, context) });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

router.post('/turn', async (req, res, next) => {
  const parsed = turnSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
  try { return res.json(await engine.turn(parsed.data)); } catch (error) { return next(error); }
});

router.get('/schema/:doctype', async (req, res, next) => {
  try { return res.json({ doctype: req.params.doctype, schema: await new FrappeClient().getMeta(req.params.doctype) }); } catch (error) { return next(error); }
});

router.get('/health', (req, res) => res.json({ status: 'healthy', service: 'erp-copilot' }));
router.get('/export/openai', exportOpenAi);
router.get('/audit', audit);
router.post('/invoke', invoke);

router.exportOpenAi = exportOpenAi;
router.invoke = invoke;
router.audit = audit;

module.exports = router;
