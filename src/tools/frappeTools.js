const FrappeClient = require('../client/frappeClient');
const auditLogger = require('../services/auditLogger');

const readMetadata = { owner: 'ERP_COPILOT', riskClass: 'READ', readOnly: true, sideEffect: false, idempotent: true };

const definitions = [
  { type: 'function', metadata: readMetadata, function: { name: 'frappe_query', description: 'Query Frappe documents.', parameters: { type: 'object', properties: { doctype: { type: 'string' }, fields: { type: 'array', items: { type: 'string' } }, filters: { type: 'array' }, limit: { type: 'integer' } }, required: ['doctype'] } } },
  { type: 'function', metadata: readMetadata, function: { name: 'frappe_get_meta', description: 'Inspect a DocType schema.', parameters: { type: 'object', properties: { doctype: { type: 'string' } }, required: ['doctype'] } } },
  { type: 'function', metadata: readMetadata, function: { name: 'frappe_check_stock', description: 'Get actual stock balance.', parameters: { type: 'object', properties: { itemCode: { type: 'string' }, warehouse: { type: 'string' } }, required: ['itemCode'] } } },
  { type: 'function', metadata: readMetadata, function: { name: 'frappe_general_ledger', description: 'Fetch General Ledger entries.', parameters: { type: 'object', properties: { account: { type: 'string' }, voucherNo: { type: 'string' }, company: { type: 'string' }, fromDate: { type: 'string' }, toDate: { type: 'string' } } } } },
  { type: 'function', metadata: readMetadata, function: { name: 'frappe_ar_summary', description: 'Calculates outstanding receivables and aging breakdown (0-30, 31-60, 60+ days) across unpaid sales invoices.', parameters: { type: 'object', properties: { company: { type: 'string' }, customer: { type: 'string' } } } } },
  { type: 'function', metadata: readMetadata, function: { name: 'frappe_low_stock_alerts', description: 'Identifies inventory items where actual available stock is zero or below safety/reorder thresholds.', parameters: { type: 'object', properties: { warehouse: { type: 'string' }, limit: { type: 'integer' } } } } },
  { type: 'function', metadata: readMetadata, function: { name: 'frappe_sales_digest', description: 'Fetches today sales totals, invoice counts, and customer breakdowns.', parameters: { type: 'object', properties: { date: { type: 'string', description: 'YYYY-MM-DD date, defaults to today' }, company: { type: 'string' } } } } },
  { type: 'function', metadata: { owner: 'ERP_COPILOT', riskClass: 'WRITE', readOnly: false, sideEffect: true, idempotent: false, requiresConfirmation: true }, function: { name: 'frappe_mutate', description: 'Insert or update a draft document.', parameters: { type: 'object', properties: { action: { type: 'string', enum: ['insert', 'update'] }, doctype: { type: 'string' }, name: { type: 'string' }, data: { type: 'object' }, preview: { type: 'boolean' }, confirmed: { type: 'boolean' } }, required: ['action', 'doctype', 'data'] } } },
];

const makeHandlers = (client = new FrappeClient(), context = {}) => ({
  frappe_query: ({ doctype, fields, filters, limit }) => client.getList(doctype, { fields, filters, limit }),
  frappe_get_meta: ({ doctype }) => client.getMeta(doctype),
  frappe_check_stock: ({ itemCode, warehouse }) => client.getList('Bin', { fields: ['item_code', 'warehouse', 'actual_qty', 'reserved_qty'], filters: [['item_code', '=', itemCode], ...(warehouse ? [['warehouse', '=', warehouse]] : [])], limit: 100 }),
  frappe_general_ledger: (args) => client.getList('GL Entry', { fields: ['account', 'debit', 'credit', 'posting_date', 'voucher_no'], filters: Object.entries({ account: args.account, voucher_no: args.voucherNo, company: args.company, posting_date: args.fromDate ? ['between', [args.fromDate, args.toDate || args.fromDate]] : undefined }).filter(([, value]) => value).map(([key, value]) => [key, ...(Array.isArray(value) ? value : ['=', value])]), limit: 100 }),
  frappe_ar_summary: async (args) => summarizeReceivables(await client.getList('Sales Invoice', {
    fields: ['name', 'customer', 'company', 'posting_date', 'due_date', 'outstanding_amount'],
    filters: [['docstatus', '=', 1], ['outstanding_amount', '>', 0], ...optionalFilters(args, ['company', 'customer'])],
    limit: 1000,
  })),
  frappe_low_stock_alerts: async ({ warehouse, limit = 100 }) => lowStockAlerts(await client.getList('Bin', {
    fields: ['item_code', 'warehouse', 'actual_qty', 'projected_qty', 'reserved_qty', 'reorder_level'],
    filters: warehouse ? [['warehouse', '=', warehouse]] : [],
    limit,
  })),
  frappe_sales_digest: async (args) => {
    const date = args.date || new Date().toISOString().slice(0, 10);
    const invoices = await client.getList('Sales Invoice', {
      fields: ['name', 'customer', 'posting_date', 'grand_total'],
      filters: [['docstatus', '=', 1], ['posting_date', '=', date], ...optionalFilters(args, ['company'])],
      limit: 1000,
    });
    return salesDigest(date, invoices);
  },
  frappe_mutate: async (args) => {
    const audit = (status, success, error = null) => auditLogger.log({
      workspaceId: context.workspaceId, userId: context.userId, action: args.action,
      doctype: args.doctype, name: args.name, data: args.data, success, status, error,
    });
    if (args.preview === true || !args.confirmed) {
      audit('PREVIEW', true);
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
    if (context.readOnly || context.read_only) {
      const error = new Error('Workspace is in read-only mode; mutations are forbidden');
      audit('FAILED', false, error.message);
      throw error;
    }
    try {
      const result = await client.mutateDoc(args.action, args.doctype, args.name || args.data, args.name ? args.data : undefined);
      audit('EXECUTED', true);
      return result;
    } catch (error) {
      audit('FAILED', false, error.message);
      throw error;
    }
  },
});

async function executeTool(name, args = {}, client, context = {}) {
  const handler = makeHandlers(client, context)[name];
  if (!handler) throw new Error(`Unknown Frappe tool: ${name}`);
  return handler(args, client);
}

function optionalFilters(args, fields) {
  return fields.filter((field) => args[field]).map((field) => [field, '=', args[field]]);
}

function summarizeReceivables(invoices) {
  const aging = { '0-30': 0, '31-60': 0, '60+': 0 };
  const today = new Date();
  for (const invoice of invoices) {
    const dueDate = invoice.due_date || invoice.posting_date || today.toISOString().slice(0, 10);
    const daysOverdue = Math.max(0, Math.floor((today - new Date(`${dueDate}T00:00:00Z`)) / 86400000));
    const bucket = daysOverdue <= 30 ? '0-30' : daysOverdue <= 60 ? '31-60' : '60+';
    aging[bucket] += Number(invoice.outstanding_amount) || 0;
  }
  return {
    totalOutstanding: invoices.reduce((total, invoice) => total + (Number(invoice.outstanding_amount) || 0), 0),
    invoiceCount: invoices.length,
    aging,
    invoices,
  };
}

function lowStockAlerts(bins) {
  return bins.filter((bin) => {
    const actual = Number(bin.actual_qty) || 0;
    const threshold = Number(bin.reorder_level) || 0;
    const projected = Number(bin.projected_qty);
    return actual <= 0 || actual <= threshold || (Number.isFinite(projected) && projected <= threshold);
  }).sort((left, right) => (Number(left.actual_qty) || 0) - (Number(right.actual_qty) || 0)
    || String(left.item_code).localeCompare(String(right.item_code)));
}

function salesDigest(date, invoices) {
  const customers = new Map();
  for (const invoice of invoices) {
    const customer = invoice.customer || 'Unknown';
    const current = customers.get(customer) || { customer, totalRevenue: 0, invoiceCount: 0 };
    current.totalRevenue += Number(invoice.grand_total) || 0;
    current.invoiceCount += 1;
    customers.set(customer, current);
  }
  return {
    date,
    totalRevenue: invoices.reduce((total, invoice) => total + (Number(invoice.grand_total) || 0), 0),
    invoiceCount: invoices.length,
    topCustomers: [...customers.values()].sort((left, right) => right.totalRevenue - left.totalRevenue),
  };
}

module.exports = { definitions, makeHandlers, executeTool };
