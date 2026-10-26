const axios = require('axios');
const config = require('../config');

const META_CACHE_TTL_MS = 900000;
const metaCache = new Map();

class FrappeClient {
  constructor(options = {}) {
    this.baseUrl = (options.url || config.FRAPPE_URL).replace(/\/$/, '');
    this.apiKey = options.apiKey ?? config.FRAPPE_API_KEY;
    this.apiSecret = options.apiSecret ?? config.FRAPPE_API_SECRET;
    this.site = options.site ?? config.FRAPPE_SITE;
    this.timeout = options.timeout || 15000;
  }

  headers() {
    const headers = { Accept: 'application/json', 'Content-Type': 'application/json' };
    if (this.apiKey && this.apiSecret) headers.Authorization = `token ${this.apiKey}:${this.apiSecret}`;
    if (this.site) headers.Host = this.site;
    return headers;
  }

  requestOptions(params) { return { timeout: this.timeout, headers: this.headers(), ...(params ? { params } : {}) }; }

  async request(method, path, data, params) {
    try {
      const url = `${this.baseUrl}${path}`;
      const options = this.requestOptions(params);
      const response = method === 'get' ? await axios.get(url, options) : method === 'post'
        ? await axios.post(url, data, options) : await axios.put(url, data, options);
      return response.data?.data ?? response.data;
    } catch (error) {
      const safe = new Error('Frappe request failed');
      safe.status = error.response?.status || 502;
      safe.code = error.code === 'ECONNABORTED' ? 'FRAPPE_TIMEOUT' : 'FRAPPE_ERROR';
      safe.cause = undefined;
      throw safe;
    }
  }

  getDoc(doctype, name) { return this.request('get', `/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`); }

  getList(doctype, options = {}) {
    const params = {};
    if (options.fields) params.fields = JSON.stringify(options.fields);
    if (options.filters) params.filters = JSON.stringify(options.filters);
    if (options.limit) params.limit_page_length = options.limit;
    return this.request('get', `/api/resource/${encodeURIComponent(doctype)}`, undefined, params);
  }

  async getMeta(doctype) {
    const key = `${this.baseUrl}:${this.site || ''}:${doctype}`;
    const cached = metaCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    const value = await this.request('get', '/api/method/frappe.desk.form.load.getdoctype',
      undefined, { doctype });
    metaCache.set(key, { value, expiresAt: Date.now() + META_CACHE_TTL_MS });
    return value;
  }

  clearMetaCache() { FrappeClient.clearMetaCache(); }

  static clearMetaCache() { metaCache.clear(); }

  runReport(reportName, filters = {}) {
    return this.request('get', '/api/method/frappe.desk.query_report.run', undefined,
      { report_name: reportName, filters: JSON.stringify(filters) });
  }

  runDocMethod(doctype, name, method, args = {}) {
    return this.request('post', `/api/method/${encodeURIComponent(doctype)}.${encodeURIComponent(method)}`,
      { name, ...args });
  }

  mutateDoc(action, doctype, nameOrData, updateData) {
    const name = typeof nameOrData === 'string' ? nameOrData : nameOrData?.name;
    const source = updateData || (typeof nameOrData === 'string' ? undefined : nameOrData);
    const data = source ? { ...source, docstatus: 0 } : undefined;
    if (data && name && !updateData) delete data.name;
    const path = `/api/resource/${encodeURIComponent(doctype)}${name ? `/${encodeURIComponent(name)}` : ''}`;
    if (action === 'insert') return this.request('post', path, data);
    if (action === 'update') return this.request('put', path, data);
    throw new Error(`Unsupported mutation action: ${action}`);
  }
}

module.exports = FrappeClient;
