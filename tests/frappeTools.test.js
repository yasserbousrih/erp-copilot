const auditLogger = require('../src/services/auditLogger');
const { definitions, executeTool } = require('../src/tools/frappeTools');

describe('executive Frappe tools', () => {
  const client = { getList: jest.fn(), mutateDoc: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    auditLogger.clear();
  });

  test('exports the three read-only executive tool definitions', () => {
    const names = definitions.map((definition) => definition.function.name);
    expect(names).toEqual(expect.arrayContaining([
      'frappe_ar_summary', 'frappe_low_stock_alerts', 'frappe_sales_digest',
    ]));
    for (const name of ['frappe_ar_summary', 'frappe_low_stock_alerts', 'frappe_sales_digest']) {
      expect(definitions.find((definition) => definition.function.name === name).metadata)
        .toMatchObject({ riskClass: 'READ', readOnly: true, sideEffect: false, idempotent: true });
    }
  });

  test('summarizes outstanding receivables into aging buckets', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-26T12:00:00Z'));
    client.getList.mockResolvedValue([
      { name: 'INV-1', customer: 'Alpha', outstanding_amount: 100, due_date: '2026-10-20' },
      { name: 'INV-2', customer: 'Beta', outstanding_amount: 200, due_date: '2026-09-10' },
      { name: 'INV-3', customer: 'Alpha', outstanding_amount: 300, due_date: '2026-07-01' },
    ]);

    await expect(executeTool('frappe_ar_summary', { company: 'Demo' }, client)).resolves.toMatchObject({
      totalOutstanding: 600,
      invoiceCount: 3,
      aging: { '0-30': 100, '31-60': 200, '60+': 300 },
    });
    expect(client.getList).toHaveBeenCalledWith('Sales Invoice', expect.objectContaining({
      filters: expect.arrayContaining([['docstatus', '=', 1], ['outstanding_amount', '>', 0], ['company', '=', 'Demo']]),
    }));
    jest.useRealTimers();
  });

  test('returns sorted zero and below-threshold stock alerts', async () => {
    client.getList.mockResolvedValue([
      { item_code: 'B', warehouse: 'Main', actual_qty: 4, projected_qty: 4, reorder_level: 5 },
      { item_code: 'OK', warehouse: 'Main', actual_qty: 10, projected_qty: 10, reorder_level: 5 },
      { item_code: 'A', warehouse: 'Main', actual_qty: 0, projected_qty: 0, reorder_level: 0 },
    ]);

    const result = await executeTool('frappe_low_stock_alerts', { warehouse: 'Main', limit: 10 }, client);
    expect(result.map((alert) => alert.item_code)).toEqual(['A', 'B']);
    expect(client.getList).toHaveBeenCalledWith('Bin', expect.objectContaining({
      filters: [['warehouse', '=', 'Main']], limit: 10,
    }));
  });

  test('aggregates a daily sales digest and ranks customers', async () => {
    client.getList.mockResolvedValue([
      { name: 'INV-1', customer: 'Alpha', grand_total: 150 },
      { name: 'INV-2', customer: 'Beta', grand_total: 50 },
      { name: 'INV-3', customer: 'Alpha', grand_total: 100 },
    ]);

    await expect(executeTool('frappe_sales_digest', { date: '2026-10-26' }, client)).resolves.toEqual({
      date: '2026-10-26', totalRevenue: 300, invoiceCount: 3,
      topCustomers: [{ customer: 'Alpha', totalRevenue: 250, invoiceCount: 2 }, { customer: 'Beta', totalRevenue: 50, invoiceCount: 1 }],
    });
  });

  test('audits mutation previews, successful execution, and failures', async () => {
    client.mutateDoc
      .mockResolvedValueOnce({ name: 'TODO-1' })
      .mockRejectedValueOnce(new Error('write failed'));
    const context = { workspaceId: 'workspace-1', userId: 'user-1' };

    await executeTool('frappe_mutate', { action: 'insert', doctype: 'ToDo', data: { description: 'preview' } }, client, context);
    await executeTool('frappe_mutate', { action: 'insert', doctype: 'ToDo', data: { description: 'done' }, confirmed: true }, client, context);
    await expect(executeTool('frappe_mutate', { action: 'update', doctype: 'ToDo', name: 'TODO-1', data: {}, confirmed: true }, client, context)).rejects.toThrow('write failed');

    expect(auditLogger.getEntries().map((entry) => entry.status)).toEqual(['FAILED', 'EXECUTED', 'PREVIEW']);
    expect(auditLogger.getEntries()[0]).toMatchObject({ success: false, error: 'write failed', workspaceId: 'workspace-1', userId: 'user-1' });
  });

  test('audits confirmed mutations rejected by workspace read-only policy', async () => {
    await expect(executeTool('frappe_mutate', {
      action: 'insert', doctype: 'ToDo', data: { description: 'blocked' }, confirmed: true,
    }, client, { workspaceId: 'workspace-1', userId: 'user-1', readOnly: true }))
      .rejects.toThrow('Workspace is in read-only mode; mutations are forbidden');

    expect(auditLogger.getEntries()[0]).toMatchObject({
      workspaceId: 'workspace-1', userId: 'user-1', success: false, status: 'FAILED',
      error: 'Workspace is in read-only mode; mutations are forbidden',
    });
    expect(client.mutateDoc).not.toHaveBeenCalled();
  });
});
