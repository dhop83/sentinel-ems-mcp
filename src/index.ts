#!/usr/bin/env node
/**
 * Sentinel EMS MCP Server — Cloud Edition
 * Plain JSON-RPC 2.0 implementation for Claude.ai custom connector
 * Supports MCP protocol 2025-11-25 (latest)
 */

import express, { Request, Response } from "express";
import { randomUUID } from "crypto";
import { SentinelEmsClient } from "./ems-client.js";

const EMS_URL  = process.env.SENTINEL_EMS_URL ?? "";
const EMS_USER = process.env.SENTINEL_EMS_USERNAME ?? "admin";
const EMS_PASS = process.env.SENTINEL_EMS_PASSWORD ?? "";
const EMS_NS   = process.env.SENTINEL_EMS_NAMESPACE_ID ?? "";
const PORT     = parseInt(process.env.PORT ?? "3000", 10);
const BASE_URL = process.env.BASE_URL ?? "";

if (!EMS_URL) { console.error("ERROR: SENTINEL_EMS_URL is required."); process.exit(1); }

const client = new SentinelEmsClient({ baseUrl: EMS_URL, username: EMS_USER, password: EMS_PASS, namespaceId: EMS_NS });

// ─── OAuth stores ─────────────────────────────────────────────────────────────
const authCodes     = new Map<string, any>();
const accessTokens  = new Set<string>();

// ─── Tools ────────────────────────────────────────────────────────────────────
const TOOLS: any[] = [
  { name: "ems_ping",                        description: "Ping the Sentinel EMS API to verify connectivity.", inputSchema: { type: "object", properties: {} } },
  { name: "ems_list_customers",              description: "List all customers in Sentinel EMS.",               inputSchema: { type: "object", properties: { name: { type: "string" }, email: { type: "string" }, limit: { type: "number" }, offset: { type: "number" } } } },
  { name: "ems_get_customer",                description: "Get full details of a customer by UID.",            inputSchema: { type: "object", properties: { uid: { type: "string" } }, required: ["uid"] } },
  { name: "ems_create_customer",             description: "Create a new customer.",                            inputSchema: { type: "object", properties: { name: { type: "string" }, email: { type: "string" }, phone: { type: "string" }, ref_id: { type: "string" }, contact: { type: "string" }, country: { type: "string" }, city: { type: "string" }, description: { type: "string" } }, required: ["name"] } },
  { name: "ems_update_customer",             description: "Update an existing customer.",                      inputSchema: { type: "object", properties: { uid: { type: "string" }, name: { type: "string" }, email: { type: "string" }, phone: { type: "string" }, country: { type: "string" } }, required: ["uid"] } },
  { name: "ems_delete_customer",             description: "Delete a customer.",                                inputSchema: { type: "object", properties: { uid: { type: "string" } }, required: ["uid"] } },
  { name: "ems_list_contacts",               description: "List contacts.",                                    inputSchema: { type: "object", properties: { customer_uid: { type: "string" }, email: { type: "string" }, limit: { type: "number" } } } },
  { name: "ems_create_contact",              description: "Create a new contact.",                             inputSchema: { type: "object", properties: { customer_uid: { type: "string" }, email: { type: "string" }, first_name: { type: "string" }, last_name: { type: "string" } }, required: ["email"] } },
  { name: "ems_list_products",               description: "List all products.",                                inputSchema: { type: "object", properties: { name: { type: "string" }, limit: { type: "number" } } } },
  { name: "ems_get_product",                 description: "Get product by UID.",                               inputSchema: { type: "object", properties: { uid: { type: "string" } }, required: ["uid"] } },
  { name: "ems_create_product",              description: "Create a new product.",                             inputSchema: { type: "object", properties: { name: { type: "string" }, version: { type: "string" }, description: { type: "string" }, namespace_name: { type: "string" } }, required: ["name"] } },
  { name: "ems_update_product",              description: "Update a product.",                                 inputSchema: { type: "object", properties: { uid: { type: "string" }, name: { type: "string" }, version: { type: "string" } }, required: ["uid"] } },
  { name: "ems_delete_product",              description: "Delete a product.",                                 inputSchema: { type: "object", properties: { uid: { type: "string" } }, required: ["uid"] } },
  { name: "ems_deploy_product",              description: "Deploy a product (DRAFT → ENABLE).",                inputSchema: { type: "object", properties: { uid: { type: "string" } }, required: ["uid"] } },
  { name: "ems_list_features",               description: "List all features.",                                inputSchema: { type: "object", properties: { name: { type: "string" }, limit: { type: "number" } } } },
  { name: "ems_get_feature",                 description: "Get feature by UID.",                               inputSchema: { type: "object", properties: { uid: { type: "string" } }, required: ["uid"] } },
  { name: "ems_create_feature",              description: "Create a new feature.",                             inputSchema: { type: "object", properties: { name: { type: "string" }, description: { type: "string" }, license_model_name: { type: "string" } }, required: ["name"] } },
  { name: "ems_list_entitlements",           description: "List entitlements.",                                inputSchema: { type: "object", properties: { customer_uid: { type: "string" }, eid: { type: "string" }, limit: { type: "number" } } } },
  { name: "ems_get_entitlement",             description: "Get entitlement by UID.",                           inputSchema: { type: "object", properties: { uid: { type: "string" } }, required: ["uid"] } },
  { name: "ems_create_entitlement",          description: "Create a new entitlement.",                         inputSchema: { type: "object", properties: { customer_uid: { type: "string" }, description: { type: "string" }, lines: { type: "array", items: { type: "object", properties: { product_uid: { type: "string" }, qty: { type: "number" }, end_date: { type: "string" } }, required: ["product_uid"] } } } } },
  { name: "ems_update_entitlement",          description: "Update an entitlement.",                            inputSchema: { type: "object", properties: { uid: { type: "string" }, state: { type: "string" }, description: { type: "string" } }, required: ["uid"] } },
  { name: "ems_enable_entitlement",          description: "Enable an entitlement.",                            inputSchema: { type: "object", properties: { uid: { type: "string" } }, required: ["uid"] } },
  { name: "ems_delete_entitlement",          description: "Delete an entitlement.",                            inputSchema: { type: "object", properties: { uid: { type: "string" } }, required: ["uid"] } },
  { name: "ems_activate_entitlement",        description: "Activate an entitlement.",                          inputSchema: { type: "object", properties: { entitlement_uid: { type: "string" } }, required: ["entitlement_uid"] } },
  { name: "ems_list_activations",            description: "List activations for an entitlement.",              inputSchema: { type: "object", properties: { entitlement_uid: { type: "string" } }, required: ["entitlement_uid"] } },
  { name: "ems_deactivate",                  description: "Deactivate an activation.",                         inputSchema: { type: "object", properties: { entitlement_uid: { type: "string" }, activation_uid: { type: "string" } }, required: ["entitlement_uid", "activation_uid"] } },
  { name: "ems_list_namespaces",             description: "List all namespaces.",                              inputSchema: { type: "object", properties: { limit: { type: "number" } } } },
  { name: "ems_list_license_models",         description: "List all license models.",                          inputSchema: { type: "object", properties: {} } },
  { name: "ems_list_channel_partners",       description: "List all channel partners.",                        inputSchema: { type: "object", properties: { name: { type: "string" }, limit: { type: "number" } } } },
  { name: "ems_get_usage_summary",           description: "Get usage summary.",                                inputSchema: { type: "object", properties: { customer_uid: { type: "string" }, from: { type: "string" }, to: { type: "string" } } } },
  { name: "ems_search_expiring_activations", description: "Search for activations expiring soon.",             inputSchema: { type: "object", properties: { days_until_expiry: { type: "number" }, customer_uid: { type: "string" } } } },
];

// ─── Tool dispatcher ──────────────────────────────────────────────────────────
async function callTool(name: string, a: any): Promise<{ content: any[]; isError?: boolean }> {
  const str = (k: string) => (a?.[k] as string | undefined) || undefined;
  const num = (k: string) => (a?.[k] as number | undefined);
  try {
    let result: any;
    switch (name) {
      case "ems_ping":                        result = await client.ping(); break;
      case "ems_list_customers":              result = await client.listCustomers({ name: str("name"), email: str("email"), limit: num("limit"), offset: num("offset") }); break;
      case "ems_get_customer":                result = await client.getCustomer(str("uid")!); break;
      case "ems_create_customer":             result = await client.createCustomer(a); break;
      case "ems_update_customer":             { const { uid, ...rest } = a; result = await client.updateCustomer(uid, rest); break; }
      case "ems_delete_customer":             result = await client.deleteCustomer(str("uid")!); break;
      case "ems_list_contacts":               result = await client.listContacts({ customer_uid: str("customer_uid"), email: str("email"), limit: num("limit") }); break;
      case "ems_create_contact":              result = await client.createContact(a); break;
      case "ems_list_products":               result = await client.listProducts({ name: str("name"), limit: num("limit") }); break;
      case "ems_get_product":                 result = await client.getProduct(str("uid")!); break;
      case "ems_create_product":              result = await client.createProduct(a); break;
      case "ems_update_product":              { const { uid, ...rest } = a; result = await client.updateProduct(uid, rest); break; }
      case "ems_delete_product":              result = await client.deleteProduct(str("uid")!); break;
      case "ems_deploy_product":              result = await client.deployProduct(str("uid")!); break;
      case "ems_list_features":               result = await client.listFeatures({ name: str("name"), limit: num("limit") }); break;
      case "ems_get_feature":                 result = await client.getFeature(str("uid")!); break;
      case "ems_create_feature":              result = await client.createFeature(a); break;
      case "ems_list_entitlements":           result = await client.listEntitlements({ customer_uid: str("customer_uid"), eid: str("eid"), limit: num("limit") }); break;
      case "ems_get_entitlement":             result = await client.getEntitlement(str("uid")!); break;
      case "ems_create_entitlement":          result = await client.createEntitlement(a); break;
      case "ems_update_entitlement":          { const { uid, ...rest } = a; result = await client.updateEntitlement(uid, rest); break; }
      case "ems_enable_entitlement":          result = await client.enableEntitlement(str("uid")!); break;
      case "ems_delete_entitlement":          result = await client.deleteEntitlement(str("uid")!); break;
      case "ems_activate_entitlement":        result = await client.activateEntitlement(str("entitlement_uid")!); break;
      case "ems_list_activations":            result = await client.getActivations(str("entitlement_uid")!); break;
      case "ems_deactivate":                  result = await client.deactivateActivation(str("entitlement_uid")!, str("activation_uid")!); break;
      case "ems_list_namespaces":             result = await client.listNamespaces({ limit: num("limit") }); break;
      case "ems_list_license_models":         result = await client.listLicenseModels(); break;
      case "ems_list_channel_partners":       result = await client.listChannelPartners({ name: str("name"), limit: num("limit") }); break;
      case "ems_get_usage_summary":           result = await client.getUsageSummary({ customer_uid: str("customer_uid"), from: str("from"), to: str("to") }); break;
      case "ems_search_expiring_activations": result = await client.searchExpiredActivations({ customer_uid: str("customer_uid"), days_until_expiry: num("days_until_expiry") }); break;
      default: return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
    }
    const text = result.ok
      ? (result.data !== undefined ? JSON.stringify(result.data, null, 2) : "204 No Content - success")
      : `Error ${result.status}: ${result.error ?? JSON.stringify(result.data)}`;
    return { content: [{ type: "text", text }], isError: !result.ok };
  } catch (err) {
    return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
  }
}

// ─── JSON-RPC dispatcher ──────────────────────────────────────────────────────
async function handleJsonRpc(msg: any): Promise<any> {
  const { method, params, id } = msg;

  // Notifications (no id) don't need responses
  if (id === undefined) {
    console.log(`Notification: ${method}`);
    return null;
  }

  try {
    let result: any;
    switch (method) {
      case "initialize":
        result = {
          protocolVersion: params?.protocolVersion ?? "2025-11-25",
          capabilities: { tools: {} },
          serverInfo: { name: "sentinel-ems-mcp", version: "2.0.0" },
        };
        break;
      case "tools/list":
        result = { tools: TOOLS };
        break;
      case "tools/call":
        result = await callTool(params.name, params.arguments ?? {});
        break;
      case "ping":
        result = {};
        break;
      case "resources/list":
        result = { resources: [] };
        break;
      case "prompts/list":
        result = { prompts: [] };
        break;
      default:
        return { jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } };
    }
    return { jsonrpc: "2.0", id, result };
  } catch (err) {
    return { jsonrpc: "2.0", id, error: { code: -32603, message: err instanceof Error ? err.message : String(err) } };
  }
}

// ─── Express ──────────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/health", (_req, res) => res.json({ status: "ok", server: "sentinel-ems-mcp", version: "2.0.0" }));

// ── OAuth discovery ──────────────────────────────────────────────────────────
app.get("/.well-known/oauth-protected-resource", (req, res) => {
  const base = BASE_URL || `${req.protocol}://${req.get("host")}`;
  res.json({ resource: base, authorization_servers: [base] });
});

app.get("/.well-known/oauth-authorization-server", (req, res) => {
  const base = BASE_URL || `${req.protocol}://${req.get("host")}`;
  res.json({
    issuer: base,
    authorization_endpoint: `${base}/authorize`,
    token_endpoint: `${base}/token`,
    registration_endpoint: `${base}/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256", "plain"],
    scopes_supported: ["mcp"],
    token_endpoint_auth_methods_supported: ["none"],
  });
});

// Dynamic client registration (handles both GET and POST)
app.all("/register", (req, res) => {
  const clientId = `client_${randomUUID()}`;
  const body = req.method === "POST" ? req.body : {};
  const meta = { ...body, client_id: clientId, client_secret: randomUUID(), token_endpoint_auth_method: "none" };
  console.log(`OAuth client registered: ${clientId}`);
  res.status(201).json(meta);
});

app.get("/authorize", (req, res) => {
  const { redirect_uri, state, client_id } = req.query as Record<string, string>;
  const code = randomUUID();
  authCodes.set(code, { client_id, used: false });
  console.log(`Auto-approving OAuth for: ${client_id}`);
  const url = new URL(redirect_uri);
  url.searchParams.set("code", code);
  if (state) url.searchParams.set("state", state);
  res.redirect(url.toString());
});

app.post("/token", (req, res) => {
  const { grant_type, code, client_id } = req.body;
  if (grant_type !== "authorization_code") { res.status(400).json({ error: "unsupported_grant_type" }); return; }
  const authCode = authCodes.get(code);
  if (!authCode || authCode.used) { res.status(400).json({ error: "invalid_grant" }); return; }
  authCode.used = true;
  const token = `ems_${randomUUID()}`;
  accessTokens.add(token);
  console.log(`Token issued for: ${client_id}`);
  res.json({ access_token: token, token_type: "Bearer", expires_in: 86400, scope: "mcp" });
});

// ── MCP endpoint (plain JSON-RPC) ────────────────────────────────────────────
app.head("/", (_req, res) => {
  res.setHeader("MCP-Protocol-Version", "2025-11-25");
  res.status(200).end();
});

app.post("/", async (req: Request, res: Response) => {
  try {
    const body = req.body;
    console.log(`MCP request: ${body.method} (id=${body.id})`);

    const response = await handleJsonRpc(body);

    if (response === null) {
      // Notification — no response body
      res.status(202).end();
      return;
    }

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Mcp-Session-Id", req.headers["mcp-session-id"] as string ?? randomUUID());
    res.json(response);
  } catch (err) {
    console.error("MCP error:", err);
    res.status(500).json({ jsonrpc: "2.0", id: null, error: { code: -32603, message: "Internal error" } });
  }
});

app.get("/", (_req, res) => {
  // SSE long-poll — keep connection open but send nothing (Claude will use POST)
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.write(": connected\n\n");
  // Keep alive
  const heartbeat = setInterval(() => res.write(": ping\n\n"), 30000);
  _req.on("close", () => clearInterval(heartbeat));
});

app.delete("/", (_req, res) => { res.status(200).end(); });

app.listen(PORT, () => {
  const base = BASE_URL || `http://localhost:${PORT}`;
  console.log(`Sentinel EMS MCP server on port ${PORT}`);
  console.log(`MCP:    ${base}/`);
  console.log(`Health: ${base}/health`);
  console.log(`OAuth:  ${base}/.well-known/oauth-authorization-server`);
});