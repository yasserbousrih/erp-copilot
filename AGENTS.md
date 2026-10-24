# ERP Copilot

ERP Copilot is a small CommonJS Node.js service on port `3008`. It is the ERP-facing reasoning layer: the HTTP API accepts a bilingual user turn, the copilot engine identifies the ERP intent, Frappe tools retrieve or mutate ERP data, and the engine returns a human-readable Arabic/English response. Frappe remains the source of truth; this service does not maintain an ERP database.

## Runtime architecture

```text
HTTP client -> Express app -> /api/copilot routes -> CopilotEngine
                                      |                 |
                                      |                 +-> OpenAI/OpenRouter (optional)
                                      +-> frappeTools -> Frappe REST API
```

- `src/config/index.js` loads and defensively normalizes environment variables.
- `src/client/frappeClient.js` owns authentication, headers, timeout behavior, URL encoding, and sanitized errors.
- `src/tools/frappeTools.js` exposes the stable tool names and JSON schemas used by the LLM.
- `src/services/copilotEngine.js` owns language detection, intent routing, tool execution, and response synthesis.
- `src/routes/copilot.js` exposes the turn, schema, and health endpoints.
- `src/app.js` is transport configuration and error handling. `src/server.js` only binds the configured port.

## Environment

All variables are optional for local mock-mode tests. Defaults are safe for development and do not imply credentials:

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3008` | HTTP listen port |
| `FRAPPE_URL` | `http://167.233.233.111:8000` | Frappe base URL |
| `FRAPPE_API_KEY` / `FRAPPE_API_SECRET` | empty | Frappe token authentication |
| `FRAPPE_SITE` | empty | Optional Frappe site sent as `Host` |
| `OPENAI_API_KEY` | empty | OpenAI provider; enables live LLM mode |
| `OPENROUTER_API_KEY` | empty | OpenRouter fallback/provider |
| `ERP_AUTH_TOKEN` | empty | Reserved for deployment-level ingress authentication |
| `LOG_LEVEL` | `info` | Application log verbosity setting |

Never commit `.env` or credentials. Production ingress should enforce `ERP_AUTH_TOKEN` before exposing this service publicly; the current local scaffold keeps auth configuration available without imposing an undocumented client contract.

## Frappe REST contracts

The client sends `Authorization: token api_key:api_secret` when both credentials exist, and `Host: site_name` when `FRAPPE_SITE` exists. Requests default to a 15-second timeout. Errors are returned as `Frappe request failed` with a safe status/code; upstream tracebacks and server messages are never exposed.

- `getDoc(doctype, name)`: `GET /api/resource/{doctype}/{name}`.
- `getList(doctype, { fields, filters, limit })`: `GET /api/resource/{doctype}` with JSON-encoded `fields`/`filters` and `limit_page_length`.
- `getMeta(doctype)`: resource endpoint with `include_meta=1`.
- `runReport(reportName, filters)`: `GET /api/method/frappe.desk.query_report.run`.
- `runDocMethod(doctype, name, method, args)`: `POST /api/method/{doctype}.{method}` with `name` and method arguments.
- `mutateDoc('insert', doctype, data)`: `POST /api/resource/{doctype}`.
- `mutateDoc('update', doctype, name, data)`: `PUT /api/resource/{doctype}/{name}`.

Mutations are intentionally draft-only: tool handlers add `docstatus: 0`; submit/cancel operations are not exposed as LLM tools.

## Dual-engine review requirement

Any production change that affects ERP reasoning, tool schemas, mutation behavior, authorization, or Frappe contracts requires two independent reviews before merge:

1. **Deterministic contract review:** tests must cover the HTTP contract, validation, error sanitization, tool arguments, and Frappe request shape.
2. **Reasoning/safety review:** independently inspect Arabic/English intent routing, prompt/tool behavior, tenant isolation, read-vs-write boundaries, and whether the response states uncertainty rather than inventing ERP facts.

Record both review outcomes in the change/PR. A passing Jest run alone is not sufficient approval for a mutation or LLM behavior change.

## Testing

Install dependencies with `npm install`; run the complete suite with `npm test`. Jest runs serially and force-exits per the package script. Tests mock Axios, Frappe, and live LLM access, so they are deterministic and do not require credentials or a reachable ERP server. Add regression coverage before changing a route, tool schema, error branch, or provider fallback.

Useful commands:

```sh
npm test
npm start
curl http://localhost:3008/health
```
