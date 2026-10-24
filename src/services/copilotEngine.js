const OpenAI = require('openai');
const config = require('../config');
const FrappeClient = require('../client/frappeClient');
const { executeTool, definitions } = require('../tools/frappeTools');

const hasArabic = (text) => /[\u0600-\u06ff]/.test(text);
const pickIntent = (message) => {
  if (/stock|inventory|balance|مخزون|رصيد المخزون/i.test(message)) return 'stock';
  if (/ledger|general ledger|gl|حساب|قيود|أستاذ عام/i.test(message)) return 'ledger';
  if (/schema|meta|doctype|حقول|مخطط/i.test(message)) return 'meta';
  return 'query';
};

class CopilotEngine {
  constructor({ client = new FrappeClient(), llm } = {}) {
    this.client = client;
    this.llm = llm || this.createLlm();
  }

  createLlm() {
    if (config.OPENAI_API_KEY) return new OpenAI({ apiKey: config.OPENAI_API_KEY });
    if (config.OPENROUTER_API_KEY) return new OpenAI({ apiKey: config.OPENROUTER_API_KEY, baseURL: 'https://openrouter.ai/api/v1' });
    return null;
  }

  async turn({ message, tenantId, conversationId, doctypeContext }) {
    const language = hasArabic(message) ? 'ar' : 'en';
    const intent = pickIntent(message);
    const executions = [];
    let data;
    try {
      if (this.llm) {
        const completion = await this.llm.chat.completions.create({ model: 'gpt-4o-mini', tools: definitions, messages: [{ role: 'system', content: 'You are a bilingual ERP assistant. Use tools for factual ERP data.' }, { role: 'user', content: message }] });
        const toolCall = completion.choices?.[0]?.message?.tool_calls?.[0];
        if (toolCall) {
          const args = JSON.parse(toolCall.function.arguments || '{}');
          data = await executeTool(toolCall.function.name, args, this.client);
          executions.push({ tool: toolCall.function.name, arguments: args, result: data, success: true });
        } else return { reply: completion.choices?.[0]?.message?.content || message, toolExecutions: [], state: { tenantId, conversationId, language, intent } };
      } else {
        const args = intent === 'stock' ? { itemCode: message.match(/[A-Z][A-Z0-9_-]+/)?.[0] || message.trim() } : { doctype: doctypeContext || 'ToDo', fields: ['name'], limit: 10 };
        const tool = intent === 'stock' ? 'frappe_check_stock' : 'frappe_query';
        data = await executeTool(tool, args, this.client);
        executions.push({ tool, arguments: args, result: data, success: true });
      }
    } catch (error) {
      executions.push({ tool: intent === 'stock' ? 'frappe_check_stock' : 'frappe_query', success: false, error: error.message });
      return { reply: language === 'ar' ? 'تعذر الوصول إلى بيانات النظام الآن. يرجى المحاولة مرة أخرى.' : 'I could not retrieve the ERP data right now. Please try again.', toolExecutions: executions, state: { tenantId, conversationId, language, intent } };
    }
    const reply = language === 'ar' ? `✅ تم جلب البيانات بنجاح.\n\n| البيان | القيمة |\n|---|---|\n| السجلات | ${Array.isArray(data) ? data.length : 1} |` : `✅ ERP data retrieved successfully.\n\n| Result | Value |\n|---|---:|\n| Records | ${Array.isArray(data) ? data.length : 1} |\n\n${intent === 'stock' && Array.isArray(data) ? data.map((row) => `- **${row.item_code || 'Item'}**: ${row.actual_qty ?? 'n/a'}`).join('\n') : ''}`;
    return { reply, toolExecutions: executions, state: { tenantId, conversationId, language, intent } };
  }
}

module.exports = CopilotEngine;
