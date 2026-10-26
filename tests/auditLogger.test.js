const auditLogger = require('../src/services/auditLogger');

describe('auditLogger', () => {
  beforeEach(() => auditLogger.clear());

  test('records normalized entries newest first and filters by identity', () => {
    const first = auditLogger.log({
      workspaceId: 'workspace-1', userId: 'user-1', action: 'insert', doctype: 'ToDo',
      data: { description: 'one' }, success: true, status: 'PREVIEW',
    });
    auditLogger.log({
      workspaceId: 'workspace-2', userId: 'user-2', action: 'update', doctype: 'ToDo',
      name: 'TODO-1', data: { description: 'two' }, success: true, status: 'EXECUTED',
    });

    expect(first).toMatchObject({
      workspaceId: 'workspace-1', userId: 'user-1', name: null, error: null,
    });
    expect(first.id).toEqual(expect.any(String));
    expect(first.timestamp).toEqual(expect.any(String));
    expect(auditLogger.getEntries({ workspaceId: 'workspace-1', limit: 1 })).toEqual([first]);
  });

  test('keeps only the latest 500 entries', () => {
    for (let index = 0; index < 505; index += 1) {
      auditLogger.log({ action: 'insert', doctype: 'ToDo', data: { index }, success: true, status: 'PREVIEW' });
    }

    const entries = auditLogger.getEntries({ limit: 1000 });
    expect(entries).toHaveLength(500);
    expect(entries[0].data.index).toBe(504);
    expect(entries[499].data.index).toBe(5);
  });
});
