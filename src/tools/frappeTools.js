const FrappeClient = require('../client/frappeClient');

const definitions = [
  { type: 'function', function: { name: 'frappe_query', description: 'Query Frappe documents.', parameters: { type: 'object', properties: { doctype: { type: 'string' }, fields: { type: 'array', items: { type: 'string' } }, filters: { type: 'array' }, limit: { type: 'integer' } }, required: ['doctype'] } } },
  { type: 'function', function: { name: 'frappe_get_meta', description: 'Inspect a DocType schema.', parameters: { type: 'object', properties: { doctype: { type: 'string' } }, required: ['doctype'] } } },
  { type: 'function', function: { name: 'frappe_check_stock', description: 'Get actual stock balance.', parameters: { type: 'object', properties: { itemCode: { type: 'string' }, warehouse: { type: 'string' } }, required: ['itemCode'] } } },
  { type: 'function', function: { name: 'frappe_general_ledger', description: 'Fetch General Ledger entries.', parameters: { type: 'object', properties: { account: { type: 'string' }, voucherNo: { type: 'string' }, company: { type: 'string' }, fromDate: { type: 'string' }, toDate: { type: 'string' } } } } },
  { type: 'function', function: { name: 'frappe_mutate', description: 'Insert or update a draft document.', parameters: { type: 'object', properties: { action: { type: 'string', enum: ['insert', 'update'] }, doctype: { type: 'string' }, name: { type: 'string' }, data: { type: 'object' } }, required: ['action', 'doctype', 'data'] } } },
];

const makeHandlers = (client = new FrappeClient()) => ({
  frappe_query: ({ doctype, fields, filters, limit }) => client.getList(doctype, { fields, filters, limit }),
  frappe_get_meta: ({ doctype }) => client.getMeta(doctype),
  frappe_check_stock: ({ itemCode, warehouse }) => client.getList('Bin', { fields: ['item_code', 'warehouse', 'actual_qty', 'reserved_qty'], filters: [['item_code', '=', itemCode], ...(warehouse ? [['warehouse', '=', warehouse]] : [])], limit: 100 }),
  frappe_general_ledger: (args) => client.getList('GL Entry', { fields: ['account', 'debit', 'credit', 'posting_date', 'voucher_no'], filters: Object.entries({ account: args.account, voucher_no: args.voucherNo, company: args.company, posting_date: args.fromDate ? ['between', [args.fromDate, args.toDate || args.fromDate]] : undefined }).filter(([, value]) => value).map(([key, value]) => [key, ...(Array.isArray(value) ? value : ['=', value])]), limit: 100 }),
  frappe_mutate: ({ action, doctype, name, data }) => client.mutateDoc(action, doctype, name || data, name ? data : undefined),
});

async function executeTool(name, args = {}, client) {
  const handler = makeHandlers(client)[name];
  if (!handler) throw new Error(`Unknown Frappe tool: ${name}`);
  return handler(args);
}

module.exports = { definitions, makeHandlers, executeTool };
