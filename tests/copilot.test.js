const request = require('supertest');
const app = require('../src/app');
const frappeClient = require('../src/client/frappeClient');
const agentBrainClient = require('../src/services/agentBrainClient');

jest.mock('../src/client/frappeClient');
jest.mock('../src/services/agentBrainClient');

describe('copilot routes and engine', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    frappeClient.prototype.getList.mockClear();
    agentBrainClient.ingestErpMessage.mockResolvedValue(null);
    frappeClient.prototype.getList.mockResolvedValue([{ item_code: 'ITEM-1', actual_qty: 12 }]);
    frappeClient.prototype.getMeta.mockResolvedValue({ fields: [{ fieldname: 'name', fieldtype: 'Data' }] });
    frappeClient.prototype.getDoc.mockResolvedValue({ name: 'DOC-1' });
  });

  test('validates turn input', async () => {
    const response = await request(app).post('/api/copilot/turn').send({ message: '' });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid request');
  });

  test('answers a stock question and records tool execution', async () => {
    const response = await request(app).post('/api/copilot/turn').send({
      message: 'Check stock balance for ITEM-1', tenantId: 'tenant-1',
    });
    expect(response.status).toBe(200);
    expect(response.body.reply).toContain('ITEM-1');
    expect(response.body.toolExecutions[0]).toMatchObject({ tool: 'frappe_check_stock', success: true });
    expect(response.body.state).toMatchObject({ tenantId: 'tenant-1' });
  });

  test('uses agent-brain for a conversational ERP turn with signed transport handled by the client', async () => {
    agentBrainClient.ingestErpMessage.mockResolvedValue({
      reply: 'Stock for ITEM-1 is 12 units.',
      toolExecutions: [{ tool: 'frappe_check_stock', success: true }],
      aiState: { intent: 'stock' },
    });

    const response = await request(app).post('/api/copilot/turn').send({
      message: 'How much stock do we have for ITEM-1?',
      tenantId: 'tenant-1',
      conversationId: 'conversation-1',
    });

    expect(response.status).toBe(200);
    expect(response.body.reply).toBe('Stock for ITEM-1 is 12 units.');
    expect(response.body.state).toMatchObject({ source: 'agent-brain', tenantId: 'tenant-1', conversationId: 'conversation-1' });
    expect(agentBrainClient.ingestErpMessage).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant-1',
      conversationId: 'conversation-1',
      message: { role: 'user', content: 'How much stock do we have for ITEM-1?' },
    }));
    expect(frappeClient.prototype.getList).not.toHaveBeenCalled();
  });

  test('falls back to local ERP handling when agent-brain is unavailable', async () => {
    agentBrainClient.ingestErpMessage.mockResolvedValue(null);
    const response = await request(app).post('/api/copilot/turn').send({ message: 'Check stock balance for ITEM-1' });

    expect(response.status).toBe(200);
    expect(response.body.toolExecutions[0]).toMatchObject({ tool: 'frappe_check_stock', success: true });
  });

  test('returns metadata through schema route', async () => {
    const response = await request(app).get('/api/copilot/schema/Item');
    expect(response.status).toBe(200);
    expect(response.body.doctype).toBe('Item');
    expect(response.body.schema.fields[0].fieldtype).toBe('Data');
  });

  test('returns a safe 500 on tool failure', async () => {
    frappeClient.prototype.getList.mockRejectedValue(new Error('backend unavailable'));
    const response = await request(app).post('/api/copilot/turn').send({ message: 'check stock' });
    expect(response.status).toBe(200);
    expect(response.body.toolExecutions[0].success).toBe(false);
    expect(response.body.reply).toContain('could not');
  });

  test('rejects malformed JSON body with a JSON error', async () => {
    const response = await request(app).post('/api/copilot/turn')
      .set('Content-Type', 'application/json').send('{bad');
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid JSON');
  });
});
