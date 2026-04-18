#!/usr/bin/env node
/**
 * Sentinel EMS MCP Server — Cloud Edition (MCP spec 2025-06-18)
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import express, { Request, Response } from "express";
import { randomUUID } from "crypto";
import { SentinelEmsClient } from "./ems-client.js";

const EMS_URL = process.env.SENTINEL_EMS_URL ?? "";
const EMS_USER = process.env.SENTINEL_EMS_USERNAME ?? "admin";
const EMS_PASS = process.env.SENTINEL_EMS_PASSWORD ?? "";
const EMS_NAMESPACE = process.env.SENTINEL_EMS_NAMESPACE_ID ?? "";
const PORT = parseInt(process.env.PORT ?? "3000", 10);

if (!EMS_URL) { console.error("ERROR: SENTINEL_EMS_URL is required."); process.exit(1); }

const client = new SentinelEmsClient({ baseUrl: EMS_URL, username: EMS_USER, password: EMS_PASS, namespaceId: EMS_NAMESPACE });

// ─── Tools ───────────────────────────────────────────────────────────────────
const TOOLS = [
  { name: "ems_ping", description: "Ping the Sentinel EMS API to verify connectivity and credentials.", inputSchema: { type: "object", properties: {} } },
  { name: "ems_list_customers", description: "List all customers in Sentinel EMS.", inputSchema: { type: "object", properties: { name: { type: "string" }, email: { type: "string" }, limit: { type: "number" }, offset: { type: "number" } } } },
  { name: "ems_get_customer", description: "Get full details of a single customer by their UID.", inputSchema: { type: "object", properties: { uid: { type: "string" } }, required: ["uid"] } },
  { name: "ems_create_customer", description: "Create a new customer in Sentinel EMS.", inputSchema: { type: "object", properties: { name: { type: "string" }, email: { type: "string" }, phone: { type: "string" }, ref_id: { type: "string" }, contact: { type: "string" }, country: { type: "string" }, city: { type: "string" }, address: { type: "string" }, description: { type: "string" } }, required: ["name"] } },
  { name: "ems_update_customer", description: "Update fields on an existing customer.", inputSchema: { type: "object", properties: { uid: { type: "string" }, name: { type: "string" }, email: { type: "string" }, phone: { type: "string" }, contact: { type: "string" }, country: { type: "string" }, description: { type: "string" } }, required: ["uid"] } },
  { name: "ems_delete_customer", description: "Delete a customer from Sentinel EMS.", inputSchema: { type: "object", properties: { uid: { type: "string" } }, required: ["uid"] } },
  { name: "ems_list_contacts", description: "List contacts in Sentinel EMS.", inputSchema: { type: "object", properties: { customer_uid: { type: "string" }, email: { type: "string" }, limit: { type: "number" }, offset: { type: "number" } } } },
  { name: "ems_get_contact", description: "Get full details of a contact by UID.", inputSchema: { type: "object", properties: { uid: { type: "string" } }, required: ["uid"] } },
  { name: "ems_create_contact", description: "Create a new contact.", inputSchema: { type: "object", properties: { customer_uid: { type: "string" }, email: { type: "string" }, first_name: { type: "string" }, last_name: { type: "string" }, phone: { type: "string" } }, required: ["email"] } },
  { name: "ems_list_products", description: "List all products in Sentinel EMS.", inputSchema: { type: "object", properties: { name: { type: "string" }, limit: { type: "number" }, offset: { type: "number" } } } },
  { name: "ems_get_product", description: "Get full details of a product by UID.", inputSchema: { type: "object", properties: { uid: { type: "string" } }, required: ["uid"] } },
  { name: "ems_create_product", description: "Create a new product.", inputSchema: { type: "object", properties: { name: { type: "string" }, version: { type: "string" }, description: { type: "string" }, namespace_name: { type: "string" }, state: { type: "string" } }, required: ["name"] } },
  { name: "ems_list_features", description: "List all features in Sentinel EMS.", inputSchema: { type: "object", properties: { name: { type: "string" }, limit: { type: "number" }, offset: { type: "number" } } } },
  { name: "ems_get_feature", description: "Get full details of a feature by UID.", inputSchema: { type: "object", properties: { uid: { type: "string" } }, required: ["uid"] } },
  { name: "ems_create_feature", description: "Create a new feature.", inputSchema: { type: "object", properties: { name: { type: "string" }, description: { type: "string" }, feature_type: { type: "string" }, namespace_name: { type: "string" }, license_model_name: { type: "string" } }, required: ["name"] } },
  { name: "ems_list_entitlements", description: "List entitlements in Sentinel EMS.", inputSchema: { type: "object", properties: { customer_uid: { type: "string" }, eid: { type: "string" }, status: { type: "string" }, limit: { type: "number" }, offset: { type: "number" } } } },
  { name: "ems_get_entitlement", description: "Get full details of an entitlement.", inputSchema: { type: "object", properties: { uid: { type: "string" } }, required: ["uid"] } },
  { name: "ems_create_entitlement", description: "Create a new entitlement for a customer.", inputSchema: { type: "object", properties: { customer_uid: { type: "string" }, eid: { type: "string" }, description: { type: "string" }, is_test: { type: "boolean" }, lines: { type: "array", items: { type: "object", properties: { product_uid: { type: "string" }, qty: { type: "number" }, start_date: { type: "string" }, end_date: { type: "string" } }, required: ["product_uid"] } } } } },
  { name: "ems_update_entitlement", description: "Update an existing entitlement.", inputSchema: { type: "object", properties: { uid: { type: "string" }, state: { type: "string" }, description: { type: "string" } }, required: ["uid"] } },
  { name: "ems_enable_entitlement", description: "Enable an entitlement.", inputSchema: { type: "object", properties: { uid: { type: "string" } }, required: ["uid"] } },
  { name: "ems_delete_entitlement", description: "Delete an entitlement.", inputSchema: { type: "object", properties: { uid: { type: "string" } }, required: ["uid"] } },
  { name: "ems_activate_entitlement", description: "Activate an entitlement to generate an activation key.", inputSchema: { type: "object", properties: { entitlement_uid: { type: "string" } }, required: ["entitlement_uid"] } },
  { name: "ems_list_activations", description: "List all activations for a given entitlement.", inputSchema: { type: "object", properties: { entitlement_uid: { type: "string" } }, required: ["entitlement_uid"] } },
  { name: "ems_deactivate", description: "Deactivate a specific activation.", inputSchema: { type: "object", properties: { entitlement_uid: { type: "string" }, activation_uid: { type: "string" } }, required: ["entitlement_uid", "activation_uid"] } },
  { name: "ems_list_namespaces", description: "List all namespaces.", inputSchema: { type: "object", properties: { limit: { type: "number" }, offset: { type: "number" } } } },
  { name: "ems_list_license_models", description: "List all license models.", inputSchema: { type: "object", properties: {} } },
  { name: "ems_list_channel_partners", description: "List all channel partners.", inputSchema: { type: "object", properties: { name: { type: "string" }, limit: { type: "number" }, offset: { type: "number" } } } },
  { name: "ems_get_usage_summary", description: "Get usage summary.", inputSchema: { type: "object", properties: { customer_uid: { type: "string" }, from: { type: "string" }, to: { type: "string" } } } },
];

// ─── Session map ─────────────────────────────────────────────────────────────
const sessions = new Map<string, { server: Server; transport: StreamableHTTPServerTransport }>();

function createSessionServer() {
  const srv = new Server({ name: "sentinel-ems-mcp", version: "2.0.0" }, { capabilities: { tools: {} } });

  srv.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  srv.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const a = args ?? {};
    const str = (k: string) => (a[k] as string | undefined) || undefined;
    const num = (k: string) => (a[k] as number | undefined);
    const bool = (k: string) => (a[k] as boolean | undefined);

    try {
      let result: any;
      switch (name) {
        case "ems_ping": result = await client.ping(); break;
        case "ems_list_customers": result = await client.listCustomers({ name: str("name"), email: str("email"), limit: num("limit"), offset: num("offset") }); break;
        case "ems_get_customer": result = await client.getCustomer(str("uid")!); break;
        case "ems_create_customer": result = await client.createCustomer(a as any); break;
        case "ems_update_customer": { const { uid, ...rest } = a; result = await client.updateCustomer(uid as string, rest); break; }
        case "ems_delete_customer": result = await client.deleteCustomer(str("uid")!); break;
        case "ems_list_contacts": result = await client.listContacts({ customer_uid: str("customer_uid"), email: str("email"), limit: num("limit"), offset: num("offset") }); break;
        case "ems_get_contact": result = await client.getContact(str("uid")!); break;
        case "ems_create_contact": result = await client.createContact(a as any); break;
        case "ems_list_products": result = await client.listProducts({ name: str("name"), limit: num("limit"), offset: num("offset") }); break;
        case "ems_get_product": result = await client.getProduct(str("uid")!); break;
        case "ems_create_product": result = await client.createProduct(a as any); break;
        case "ems_list_features": result = await client.listFeatures({ name: str("name"), limit: num("limit"), offset: num("offset") }); break;
        case "ems_get_feature": result = await client.getFeature(str("uid")!); break;
        case "ems_create_feature": result = await client.createFeature(a as any); break;
        case "ems_list_entitlements": result = await client.listEntitlements({ customer_uid: str("customer_uid"), eid: str("eid"), status: str("status"), limit: num("limit"), offset: num("offset") }); break;
        case "ems_get_entitlement": result = await client.getEntitlement(str("uid")!); break;
        case "ems_create_entitlement": result = await client.createEntitlement(a as any); break;
        case "ems_update_entitlement": { const { uid, ...rest } = a; result = await client.updateEntitlement(uid as string, rest as any); break; }
        case "ems_enable_entitlement": result = await client.enableEntitlement(str("uid")!); break;
        case "ems_delete_entitlement": result = await client.deleteEntitlement(str("uid")!); break;
        case "ems_activate_entitlement": result = await client.activateEntitlement(str("entitlement_uid")!); break;
        case "ems_list_activations": result = await client.getActivations(str("entitlement_uid")!); break;
        case "ems_deactivate": result = await client.deactivateActivation(str("entitlement_uid")!, str("activation_uid")!); break;
        case "ems_list_namespaces": result = await client.listNamespaces({ limit: num("limit"), offset: num("offset") }); break;
        case "ems_list_license_models": result = await client.listLicenseModels(); break;
        case "ems_list_channel_partners": result = await client.listChannelPartners({ name: str("name"), limit: num("limit"), offset: num("offset") }); break;
        case "ems_get_usage_summary": result = await client.getUsageSummary({ customer_uid: str("customer_uid"), from: str("from"), to: str("to") }); break;
        default: return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
      }
      const text = result.ok
        ? (result.data !== undefined ? JSON.stringify(result.data, null, 2) : "204 No Content")
        : `Error ${result.status}: ${result.error ?? JSON.stringify(result.data)}`;
      return { content: [{ type: "text", text }], isError: !result.ok };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
    }
  });

  return srv;
}

// ─── Express ─────────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", server: "sentinel-ems-mcp", version: "2.0.0" });
});

// MCP protocol version discovery (HEAD /)
app.head("/", (_req, res) => {
  res.setHeader("MCP-Protocol-Version", "2025-06-18");
  res.status(200).end();
});

// Main MCP endpoint (POST /) — stateless or session-based
app.post("/", async (req: Request, res: Response) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  if (sessionId && sessions.has(sessionId)) {
    const { transport } = sessions.get(sessionId)!;
    await transport.handleRequest(req, res);
    return;
  }

  // New session
  const newSessionId = randomUUID();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => newSessionId,
  });
  const srv = createSessionServer();
  sessions.set(newSessionId, { server: srv, transport });

  res.on("close", () => {
    sessions.delete(newSessionId);
  });

  await srv.connect(transport);
  await transport.handleRequest(req, res);
});

// SSE upgrade for GET /
app.get("/", async (req: Request, res: Response) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (sessionId && sessions.has(sessionId)) {
    const { transport } = sessions.get(sessionId)!;
    await transport.handleRequest(req, res);
    return;
  }
  res.status(400).json({ error: "No session. POST first." });
});

app.delete("/", async (req: Request, res: Response) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (sessionId && sessions.has(sessionId)) {
    const { transport } = sessions.get(sessionId)!;
    await transport.handleRequest(req, res);
    sessions.delete(sessionId);
    return;
  }
  res.status(404).json({ error: "Session not found" });
});

app.listen(PORT, () => {
  console.log(`Sentinel EMS MCP server listening on port ${PORT}`);
  console.log(`Health: http://localhost:${PORT}/health`);
  console.log(`MCP endpoint: http://localhost:${PORT}/`);
});