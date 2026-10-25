const axios = require('axios');
const { ingestErpMessage } = require('../src/services/agentBrainClient');

jest.mock('axios');
jest.mock('../src/services/brainAuth', () => ({
  getChannelAuthHeaders: jest.fn(() => ({ 'x-test': 'auth' })),
}));

describe('agent brain client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    axios.post.mockResolvedValue({ data: { reply: 'ok' } });
  });

  test('omits agentId when no agent is provided', async () => {
    await ingestErpMessage({ tenantId: 'tenant-1', message: { role: 'user', content: 'hi' } });
    expect(axios.post.mock.calls[0][1]).not.toHaveProperty('agentId');
  });

  test('uses agentId from payload client configuration', async () => {
    await ingestErpMessage({
      tenantId: 'tenant-1',
      clientConfig: { agentId: 'agent-1' },
      message: { role: 'user', content: 'hi' },
    });
    expect(axios.post.mock.calls[0][1].agentId).toBe('agent-1');
  });
});
