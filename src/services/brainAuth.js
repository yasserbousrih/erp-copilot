const crypto = require('crypto');
const config = require('../config');

function createChannelToken({ tenantId, service = 'erp-copilot', secret = config.BRAIN_CHANNEL_HMAC_KEY }) {
  if (!tenantId || !tenantId.trim()) throw new Error('tenantId is required for channel token creation');
  if (!secret || !secret.trim()) throw new Error('BRAIN_CHANNEL_HMAC_KEY is required');

  const normalizedTenantId = tenantId.trim();
  const encodedTenantId = Buffer.from(normalizedTenantId, 'utf8').toString('base64url');
  const payload = `v1:${service}:${normalizedTenantId}`;
  const signature = crypto.createHmac('sha256', secret.trim()).update(payload).digest('hex');
  return `brn.v1.${service}.${encodedTenantId}.${signature}`;
}

function getChannelAuthHeaders({ tenantId, service = 'erp-copilot', secret = config.BRAIN_CHANNEL_HMAC_KEY } = {}) {
  const token = createChannelToken({ tenantId, service, secret });
  const normalizedTenantId = tenantId.trim();
  return {
    Authorization: `Bearer ${token}`,
    'X-Tenant-Id': normalizedTenantId,
    'X-Client-Id': normalizedTenantId,
    'Content-Type': 'application/json',
  };
}

module.exports = { createChannelToken, getChannelAuthHeaders };
