const axios = require('axios');
const config = require('../config');
const { getChannelAuthHeaders } = require('./brainAuth');

async function ingestErpMessage({ tenantId = 'default', ...payload }) {
  let headers;
  try {
    headers = getChannelAuthHeaders({ tenantId, service: 'erp-copilot' });
  } catch (error) {
    return null;
  }

  try {
    const response = await axios.post(`${config.AGENT_BRAIN_URL}/brain/ingest`, {
      source: 'lite',
      workspaceId: tenantId,
      tenantId,
      channel: 'web',
      ...payload,
      agentId: payload.agentId || config.AGENT_ID,
    }, { headers, timeout: 15000 });
    return response.data;
  } catch (error) {
    return null;
  }
}

module.exports = { ingestErpMessage };
