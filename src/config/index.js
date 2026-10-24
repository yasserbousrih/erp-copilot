require('dotenv').config();

const integer = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const text = (value, fallback = '') => (typeof value === 'string' ? value.trim() || fallback : fallback);

module.exports = Object.freeze({
  PORT: integer(process.env.PORT, 3008),
  FRAPPE_URL: text(process.env.FRAPPE_URL, 'http://167.233.233.111:8000').replace(/\/$/, ''),
  FRAPPE_API_KEY: text(process.env.FRAPPE_API_KEY),
  FRAPPE_API_SECRET: text(process.env.FRAPPE_API_SECRET),
  FRAPPE_SITE: text(process.env.FRAPPE_SITE),
  OPENAI_API_KEY: text(process.env.OPENAI_API_KEY),
  OPENROUTER_API_KEY: text(process.env.OPENROUTER_API_KEY),
  ERP_AUTH_TOKEN: text(process.env.ERP_AUTH_TOKEN),
  LOG_LEVEL: text(process.env.LOG_LEVEL, 'info'),
});
