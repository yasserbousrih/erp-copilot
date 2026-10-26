const { randomUUID } = require('crypto');

const MAX_ENTRIES = 500;
const entries = [];

function log(entry) {
  const recorded = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    workspaceId: entry.workspaceId || null,
    userId: entry.userId || null,
    action: entry.action,
    doctype: entry.doctype,
    name: entry.name || null,
    data: entry.data || {},
    success: Boolean(entry.success),
    status: entry.status,
    error: entry.error || null,
  };
  entries.unshift(recorded);
  if (entries.length > MAX_ENTRIES) entries.length = MAX_ENTRIES;
  return recorded;
}

function getEntries({ workspaceId, userId, limit = 100 } = {}) {
  const safeLimit = Math.max(0, Math.min(Number(limit) || 100, MAX_ENTRIES));
  return entries
    .filter((entry) => !workspaceId || entry.workspaceId === workspaceId)
    .filter((entry) => !userId || entry.userId === userId)
    .slice(0, safeLimit);
}

function clear() { entries.length = 0; }

module.exports = { log, getEntries, clear };
