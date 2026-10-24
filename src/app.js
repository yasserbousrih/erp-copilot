const express = require('express');
const cors = require('cors');
const copilotRoutes = require('./routes/copilot');

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => { req.startedAt = Date.now(); res.on('finish', () => console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - req.startedAt}ms`)); next(); });
app.get('/health', (req, res) => res.json({ status: 'healthy', service: 'erp-copilot' }));
app.use('/api/copilot', copilotRoutes);
app.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use((error, req, res, next) => {
  if (error instanceof SyntaxError && error.status === 400 && error.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
  console.error(error);
  return res.status(error.status || 500).json({ error: 'Internal server error' });
});
module.exports = app;
