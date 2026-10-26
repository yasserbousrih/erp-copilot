const FrappeClient = require('../client/frappeClient');

const readMetadata = { owner: 'ERP_COPILOT', riskClass: 'READ', readOnly: true, sideEffect: false, idempotent: true };

const definitions = [
  { type: 'function', metadata: readMetadata, function: { name: 'frappe_query', description: 'Query Frappe documents.', parameters: { type: 'object', properties: { doctype: { type: 'string' }, fields: { type: 'array', items: { type: 'string' } }, filters: { type: 'array' }, limit: { type: 'integer' } }, required: ['doctype'] } } },
  { type: 'function', metadata: readMetadata, function: { name: 'frappe_get_meta', description: 'Inspect a DocType schema.', parameters: { type: 'object', properties: { doctype: { type: 'string' } }, required: ['doctype'] } } },
  { type: 'function', metadata: readMetadata, function: { name: 'frappe_check_stock', description: 'Get actual stock balance.', parameters: { type: 'object', properties: { itemCode: { type: 'string' }, warehouse: { type: 'string' } }, required: ['itemCode'] } } },
  { type: 'function', metadata: readMetadata, function: { name: 'frappe_general_ledger', description: 'Fetch General Ledger entries.', parameters: { type: 'object', properties: { account: { type: 'string' }, voucherNo: { type: 'string' }, company: { type: 'string' }, fromDate: { type: 'string' }, toDate: { type: 'string' } } } } },
  { type: 'function', metadata: { owner: 'ERP_COPILOT', riskClass: 'WRITE', readOnly: false, sideEffect: true, idempotent: false, requiresConfirmation: true }, function: { name: 'frappe_mutate', description: 'Insert or update a draft document.', parameters: { type: 'object', properties: { action: { type: 'string', enum: ['insert', 'update'] }, doctype: { type: 'string' }, name: { type: 'string' }, data: { type: 'object' }, preview: { type: 'boolean' }, confirmed: { type: 'boolean' } }, required: ['action', 'doctype', 'data'] } } },
];

const makeHandlers = (client = new FrappeClient()) => ({
  frappe_query: ({ doctype, fields, filters, limit }) => client.getList(doctype, { fields, filters, limit }),
  frappe_get_meta: ({ doctype }) => client.getMeta(doctype),
  frappe_check_stock: ({ itemCode, warehouse }) => client.getList('Bin', { fields: ['item_code', 'warehouse', 'actual_qty', 'reserved_qty'], filters: [['item_code', '=', itemCode], ...(warehouse ? [['warehouse', '=', warehouse]] : [])], limit: 100 }),
  frappe_general_ledger: (args) => client.getList('GL Entry', { fields: ['account', 'debit', 'credit', 'posting_date', 'voucher_no'], filters: Object.entries({ account: args.account, voucher_no: args.voucherNo, company: args.company, posting_date: args.fromDate ? ['between', [args.fromDate, args.toDate || args.fromDate]] : undefined }).filter(([, value]) => value).map(([key, value]) => [key, ...(Array.isArray(value) ? value : ['=', value])]), limit: 100 }),
  frappe_mutate: (args) => {
    if (args.preview === true || !args.confirmed) {
      return {
        preview: true,
        requiresConfirmation: true,
        riskClass: 'WRITE',
        action: args.action,
        doctype: args.doctype,
        name: args.name || null,
        proposedData: args.data,
        impactSummary: `Draft preview: Ready to ${args.action} ${args.doctype}${args.name ? ` ${args.name}` : ''}. Pass confirmed: true to execute.`,
      };
    }
    return client.mutateDoc(args.action, args.doctype, args.name || args.data, args.name ? args.data : undefined);
  },
});

async function executeTool(name, args = {}, client, context = {}) {
  if ((context.readOnly || context.read_only) && name === 'frappe_mutate' && args.confirmed) {
    throw new Error('Workspace is in read-only mode; mutations are forbidden');
  }
  const handler = makeHandlers(client)[name];
  if (!handler) throw new Error(`Unknown Frappe tool: ${name}`);
  return handler(args, client);
}

module.exports = { definitions, makeHandlers, executeTool };
