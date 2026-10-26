const axios = require('axios');
const FrappeClient = require('../src/client/frappeClient');

jest.mock('axios');

describe('FrappeClient', () => {
  const client = new FrappeClient({
    url: 'http://frappe.test',
    apiKey: 'key',
    apiSecret: 'secret',
    site: 'tenant.test',
    timeout: 1234,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    FrappeClient.clearMetaCache();
  });

  test('caches metadata by doctype for 15 minutes', async () => {
    axios.get.mockResolvedValue({ data: { data: { fields: [{ fieldname: 'name' }] } } });

    await expect(client.getMeta('Item')).resolves.toEqual({ fields: [{ fieldname: 'name' }] });
    await expect(client.getMeta('Item')).resolves.toEqual({ fields: [{ fieldname: 'name' }] });

    expect(axios.get).toHaveBeenCalledTimes(1);
  });

  test('clears the metadata cache for deterministic refreshes', async () => {
    axios.get
      .mockResolvedValueOnce({ data: { data: { version: 1 } } })
      .mockResolvedValueOnce({ data: { data: { version: 2 } } });

    await client.getMeta('Item');
    client.clearMetaCache();

    await expect(client.getMeta('Item')).resolves.toEqual({ version: 2 });
    expect(axios.get).toHaveBeenCalledTimes(2);
  });

  test('refreshes metadata after the 15 minute TTL expires', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-26T00:00:00Z'));
    axios.get
      .mockResolvedValueOnce({ data: { data: { version: 1 } } })
      .mockResolvedValueOnce({ data: { data: { version: 2 } } });

    await client.getMeta('Item');
    jest.advanceTimersByTime(900001);

    await expect(client.getMeta('Item')).resolves.toEqual({ version: 2 });
    expect(axios.get).toHaveBeenCalledTimes(2);
    jest.useRealTimers();
  });

  test('gets a document with auth and tenant headers', async () => {
    axios.get.mockResolvedValue({ data: { data: { name: 'INV-1' } } });
    await expect(client.getDoc('Sales Invoice', 'INV-1')).resolves.toEqual({ name: 'INV-1' });
    expect(axios.get).toHaveBeenCalledWith(
      'http://frappe.test/api/resource/Sales%20Invoice/INV-1',
      expect.objectContaining({ timeout: 1234, headers: expect.objectContaining({
        Authorization: 'token key:secret', Host: 'tenant.test',
      }) }),
    );
  });

  test('lists documents and encodes query parameters', async () => {
    axios.get.mockResolvedValue({ data: { data: [{ name: 'BIN-1' }] } });
    const result = await client.getList('Bin', {
      fields: ['item_code', 'actual_qty'],
      filters: [['warehouse', '=', 'Main'], ['actual_qty', '>', 0]],
      limit: 10,
    });
    expect(result).toEqual([{ name: 'BIN-1' }]);
    expect(axios.get.mock.calls[0][1].params).toEqual(expect.objectContaining({
      fields: '["item_code","actual_qty"]',
      filters: '[["warehouse","=","Main"],["actual_qty",">",0]]',
      limit_page_length: 10,
    }));
  });

  test('supports metadata, reports, methods, and mutations', async () => {
    axios.get
      .mockResolvedValueOnce({ data: { data: { fields: [] } } })
      .mockResolvedValueOnce({ data: { data: { result: [] } } });
    axios.post
      .mockResolvedValueOnce({ data: { data: { name: 'TODO-1', done: true } } })
      .mockResolvedValueOnce({ data: { data: { name: 'NEW-1' } } });
    await client.getMeta('Item');
    await client.runReport('Stock Balance', { company: 'Demo' });
    await client.runDocMethod('ToDo', 'TODO-1', 'complete', { done: true });
    await client.mutateDoc('insert', 'ToDo', { description: 'test' });
    expect(axios.post).toHaveBeenCalledWith(expect.stringContaining('/api/resource/ToDo'),
      { description: 'test', docstatus: 0 }, expect.any(Object));
  });

  test('sanitizes axios errors and preserves status', async () => {
    axios.get.mockRejectedValue({ response: { status: 403, data: { exc: 'secret traceback', _server_messages: 'x' } } });
    await expect(client.getDoc('User', 'Administrator')).rejects.toMatchObject({
      status: 403, message: 'Frappe request failed',
    });
    await expect(client.getDoc('User', 'Administrator')).rejects.not.toThrow('secret traceback');
  });
});
