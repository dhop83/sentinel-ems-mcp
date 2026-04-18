#!/usr/bin/env node
/**
 * Sentinel EMS MCP Server — Cloud Edition
 * Plain JSON-RPC 2.0 implementation for Claude.ai custom connector
 * Supports MCP protocol 2025-11-25 (latest)
 *
 * Full parity with local stdio MCP — all tools included.
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
const authCodes    = new Map<string, any>();
const accessTokens = new Set<string>();

// ─── Tools ────────────────────────────────────────────────────────────────────
const TOOLS: any[] = [

  // ── System ────────────────────────────────────────────────────────────────
  { name: "ems_ping", description: "Ping the Sentinel EMS API to verify connectivity.", inputSchema: { type: "object", properties: {} } },

  // ── Customers ─────────────────────────────────────────────────────────────
  { name: "ems_list_customers",  description: "List all customers in Sentinel EMS. Supports filtering by name or email and pagination.", inputSchema: { type: "object", properties: { name: { type: "string", description: "Filter by customer name" }, email: { type: "string" }, limit: { type: "number" }, offset: { type: "number" } } } },
  { name: "ems_get_customer",    description: "Get full details of a customer by UID.", inputSchema: { type: "object", properties: { uid: { type: "string" } }, required: ["uid"] } },
  { name: "ems_create_customer", description: "Create a new customer in Sentinel EMS.", inputSchema: { type: "object", properties: { name: { type: "string" }, email: { type: "string" }, phone: { type: "string" }, ref_id: { type: "string" }, contact: { type: "string" }, country: { type: "string" }, city: { type: "string" }, address: { type: "string" }, description: { type: "string" } }, required: ["name"] } },
  { name: "ems_update_customer", description: "Update fields on an existing customer.", inputSchema: { type: "object", properties: { uid: { type: "string" }, name: { type: "string" }, email: { type: "string" }, phone: { type: "string" }, contact: { type: "string" }, country: { type: "string" }, description: { type: "string" } }, required: ["uid"] } },
  { name: "ems_delete_customer", description: "Delete a customer from Sentinel EMS.", inputSchema: { type: "object", properties: { uid: { type: "string" } }, required: ["uid"] } },

  // ── Contacts ──────────────────────────────────────────────────────────────
  { name: "ems_list_contacts",   description: "List contacts in Sentinel EMS. Filter by customer UID or email.", inputSchema: { type: "object", properties: { customer_uid: { type: "string" }, email: { type: "string" }, limit: { type: "number" }, offset: { type: "number" } } } },
  { name: "ems_get_contact",     description: "Get full details of a contact by UID.", inputSchema: { type: "object", properties: { uid: { type: "string" } }, required: ["uid"] } },
  { name: "ems_create_contact",  description: "Create a new contact and associate with a customer.", inputSchema: { type: "object", properties: { customer_uid: { type: "string" }, email: { type: "string" }, first_name: { type: "string" }, last_name: { type: "string" }, phone: { type: "string" }, description: { type: "string" } }, required: ["email"] } },
  { name: "ems_update_contact",  description: "Update an existing contact.", inputSchema: { type: "object", properties: { uid: { type: "string" }, email: { type: "string" }, first_name: { type: "string" }, last_name: { type: "string" }, phone: { type: "string" }, description: { type: "string" } }, required: ["uid"] } },

  // ── Products ──────────────────────────────────────────────────────────────
  { name: "ems_list_products",   description: "List all products defined in Sentinel EMS.", inputSchema: { type: "object", properties: { name: { type: "string" }, limit: { type: "number" }, offset: { type: "number" } } } },
  { name: "ems_get_product",     description: "Get full details of a product by UID.", inputSchema: { type: "object", properties: { uid: { type: "string" } }, required: ["uid"] } },
  { name: "ems_create_product",  description: "Create a new product. Use feature_names (comma-separated) to attach features and state=ENABLE to deploy in one step.", inputSchema: { type: "object", properties: { name: { type: "string" }, version: { type: "string" }, description: { type: "string" }, namespace_name: { type: "string", description: "Namespace name (e.g. Default)" }, feature_names: { type: "string", description: "Comma-separated feature names to attach e.g. Feature_1,Feature_2" }, feature_uids: { type: "string", description: "Comma-separated feature UIDs to attach" }, state: { type: "string", description: "Set to ENABLE to deploy immediately" } }, required: ["name"] } },
  { name: "ems_update_product",  description: "Update an existing product. Use feature_names (comma-separated) to attach features, state=ENABLE to deploy.", inputSchema: { type: "object", properties: { uid: { type: "string" }, name: { type: "string" }, version: { type: "string" }, description: { type: "string" }, feature_names: { type: "string", description: "Comma-separated feature names to attach e.g. Feature_1,Feature_2" }, feature_uids: { type: "string", description: "Comma-separated feature UIDs to attach" }, state: { type: "string", description: "ENABLE to deploy, DISABLE to deactivate" } }, required: ["uid"] } },
  { name: "ems_delete_product",  description: "Delete a product.", inputSchema: { type: "object", properties: { uid: { type: "string" } }, required: ["uid"] } },
  { name: "ems_deploy_product",  description: "Deploy a product (DRAFT → ENABLE).", inputSchema: { type: "object", properties: { uid: { type: "string" } }, required: ["uid"] } },
  {
    name: "ems_add_feature_to_product",
    description: "Add one or more features to an existing product. Accepts feature names (resolved automatically) or feature UIDs. Returns the updated product.",
    inputSchema: {
      type: "object",
      properties: {
        product_uid:   { type: "string", description: "UID of the product to update" },
        feature_names: { type: "string", description: "Comma-separated feature names to add, e.g. 'HelloClaude,Feature2'" },
        feature_uids:  { type: "string", description: "Comma-separated feature UIDs to add" },
      },
      required: ["product_uid"],
    },
  },

  // ── Features ──────────────────────────────────────────────────────────────
  { name: "ems_list_features",   description: "List all features defined in Sentinel EMS.", inputSchema: { type: "object", properties: { name: { type: "string" }, limit: { type: "number" }, offset: { type: "number" } } } },
  { name: "ems_get_feature",     description: "Get feature by UID.", inputSchema: { type: "object", properties: { uid: { type: "string" } }, required: ["uid"] } },
  {
    name: "ems_create_feature",
    description: "Create a new feature. Specify namespace_name (e.g. 'Default') and license_model_name (e.g. 'Subscription') to configure the feature at creation time.",
    inputSchema: {
      type: "object",
      properties: {
        name:               { type: "string", description: "Feature name" },
        description:        { type: "string" },
        namespace_name:     { type: "string", description: "Namespace to place the feature in (e.g. 'Default')" },
        license_model_name: { type: "string", description: "License model to assign (e.g. 'Subscription', 'Perpetual')" },
      },
      required: ["name"],
    },
  },
  { name: "ems_update_feature",  description: "Update an existing feature.", inputSchema: { type: "object", properties: { uid: { type: "string" }, name: { type: "string" }, description: { type: "string" } }, required: ["uid"] } },
  { name: "ems_delete_feature",  description: "Delete a feature.", inputSchema: { type: "object", properties: { uid: { type: "string" } }, required: ["uid"] } },
  {
    name: "ems_add_feature_license_model",
    description: "Associate a license model with a feature. Supply license_model_name to resolve automatically, or pass license_model_uid + enforcement_uid directly.",
    inputSchema: {
      type: "object",
      properties: {
        feature_uid:        { type: "string" },
        license_model_name: { type: "string", description: "License model name — enforcement resolved automatically" },
        license_model_uid:  { type: "string", description: "License model UID (use with enforcement_uid)" },
        enforcement_uid:    { type: "string" },
        is_default:         { type: "boolean", description: "Set as default license model (default: true)" },
      },
      required: ["feature_uid"],
    },
  },

  // ── Entitlements ──────────────────────────────────────────────────────────
  { name: "ems_list_entitlements",          description: "List entitlements. Filter by customer UID or EID.", inputSchema: { type: "object", properties: { customer_uid: { type: "string" }, eid: { type: "string" }, limit: { type: "number" }, offset: { type: "number" } } } },
  { name: "ems_get_entitlement",            description: "Get entitlement by UID.", inputSchema: { type: "object", properties: { uid: { type: "string" } }, required: ["uid"] } },
  { name: "ems_create_entitlement",         description: "Create a new entitlement for a customer.", inputSchema: { type: "object", properties: { customer_uid: { type: "string" }, description: { type: "string" }, is_test: { type: "boolean" }, lines: { type: "array", items: { type: "object", properties: { product_uid: { type: "string" }, qty: { type: "number" }, start_date: { type: "string" }, end_date: { type: "string" } }, required: ["product_uid"] } } } } },
  { name: "ems_update_entitlement",         description: "Update an entitlement (state, description, dates).", inputSchema: { type: "object", properties: { uid: { type: "string" }, state: { type: "string" }, description: { type: "string" }, send_notification: { type: "boolean" }, cc_email: { type: "string" }, ref_id1: { type: "string" }, ref_id2: { type: "string" } }, required: ["uid"] } },
  { name: "ems_enable_entitlement",         description: "Enable an entitlement (DRAFT → ENABLE).", inputSchema: { type: "object", properties: { uid: { type: "string" } }, required: ["uid"] } },
  { name: "ems_split_entitlement",          description: "Split an entitlement into a child entitlement.", inputSchema: { type: "object", properties: { uid: { type: "string" }, qty: { type: "number" }, customer_uid: { type: "string" } }, required: ["uid", "qty"] } },
  { name: "ems_delete_entitlement",         description: "Delete an entitlement.", inputSchema: { type: "object", properties: { uid: { type: "string" } }, required: ["uid"] } },
  { name: "ems_get_entitled_features",      description: "Get entitled features summary for an entitlement.", inputSchema: { type: "object", properties: { uid: { type: "string" } }, required: ["uid"] } },
  { name: "ems_batch_create_entitlements",  description: "Create multiple entitlements in a single API call.", inputSchema: { type: "object", properties: { entitlements: { type: "array", items: { type: "object" } } }, required: ["entitlements"] } },

  // ── Activations ───────────────────────────────────────────────────────────
  { name: "ems_activate_entitlement",           description: "Activate an entitlement (generates license).", inputSchema: { type: "object", properties: { entitlement_uid: { type: "string" }, attrs: { type: "array", items: { type: "object", properties: { name: { type: "string" }, value: { type: "string" } }, required: ["name", "value"] } } }, required: ["entitlement_uid"] } },
  { name: "ems_list_activations",               description: "List activations for an entitlement.", inputSchema: { type: "object", properties: { entitlement_uid: { type: "string" } }, required: ["entitlement_uid"] } },
  { name: "ems_get_activation",                 description: "Get a specific activation by UID.", inputSchema: { type: "object", properties: { entitlement_uid: { type: "string" }, activation_uid: { type: "string" } }, required: ["entitlement_uid", "activation_uid"] } },
  { name: "ems_deactivate",                     description: "Deactivate an activation.", inputSchema: { type: "object", properties: { entitlement_uid: { type: "string" }, activation_uid: { type: "string" } }, required: ["entitlement_uid", "activation_uid"] } },
  { name: "ems_renew_activation",               description: "Renew an activation, optionally extending end date.", inputSchema: { type: "object", properties: { entitlement_uid: { type: "string" }, activation_uid: { type: "string" }, end_date: { type: "string", description: "New end date YYYY-MM-DD" } }, required: ["entitlement_uid", "activation_uid"] } },
  { name: "ems_search_expiring_activations",    description: "Search for activations expiring within N days.", inputSchema: { type: "object", properties: { days_until_expiry: { type: "number" }, customer_uid: { type: "string" }, product_uid: { type: "string" }, limit: { type: "number" }, offset: { type: "number" } } } },
  { name: "ems_generate_permission_ticket",     description: "Generate a permission ticket (step 1 of revocation workflow).", inputSchema: { type: "object", properties: { entitlement_uid: { type: "string" }, activation_uid: { type: "string" } }, required: ["entitlement_uid", "activation_uid"] } },
  { name: "ems_generate_revocation_ticket",     description: "Generate a revocation ticket (step 2 of revocation workflow).", inputSchema: { type: "object", properties: { entitlement_uid: { type: "string" }, activation_uid: { type: "string" }, permission_ticket: { type: "string" } }, required: ["entitlement_uid", "activation_uid", "permission_ticket"] } },

  // ── Activatees ────────────────────────────────────────────────────────────
  { name: "ems_list_activatees",   description: "List activatees for an activation.", inputSchema: { type: "object", properties: { entitlement_uid: { type: "string" }, activation_uid: { type: "string" } }, required: ["entitlement_uid", "activation_uid"] } },
  { name: "ems_add_activatee",     description: "Add an activatee (user) to an activation.", inputSchema: { type: "object", properties: { entitlement_uid: { type: "string" }, activation_uid: { type: "string" }, email: { type: "string" }, first_name: { type: "string" }, last_name: { type: "string" } }, required: ["entitlement_uid", "activation_uid", "email"] } },
  { name: "ems_remove_activatee",  description: "Remove an activatee from an activation.", inputSchema: { type: "object", properties: { entitlement_uid: { type: "string" }, activation_uid: { type: "string" }, activatee_uid: { type: "string" } }, required: ["entitlement_uid", "activation_uid", "activatee_uid"] } },

  // ── Channel Partners ──────────────────────────────────────────────────────
  { name: "ems_list_channel_partners",              description: "List all channel partners.", inputSchema: { type: "object", properties: { name: { type: "string" }, limit: { type: "number" }, offset: { type: "number" } } } },
  { name: "ems_get_channel_partner",                description: "Get a channel partner by UID.", inputSchema: { type: "object", properties: { uid: { type: "string" } }, required: ["uid"] } },
  { name: "ems_create_channel_partner",             description: "Create a new channel partner.", inputSchema: { type: "object", properties: { name: { type: "string" }, email: { type: "string" }, phone: { type: "string" }, country: { type: "string" }, ref_id: { type: "string" }, description: { type: "string" } }, required: ["name"] } },
  { name: "ems_update_channel_partner",             description: "Update a channel partner.", inputSchema: { type: "object", properties: { uid: { type: "string" }, name: { type: "string" }, email: { type: "string" }, country: { type: "string" } }, required: ["uid"] } },
  { name: "ems_delete_channel_partner",             description: "Delete a channel partner.", inputSchema: { type: "object", properties: { uid: { type: "string" } }, required: ["uid"] } },
  { name: "ems_associate_entitlement_to_partner",   description: "Associate an entitlement with a channel partner.", inputSchema: { type: "object", properties: { entitlement_uid: { type: "string" }, partner_uid: { type: "string" } }, required: ["entitlement_uid", "partner_uid"] } },
  { name: "ems_remove_entitlement_from_partner",    description: "Remove a channel partner association from an entitlement.", inputSchema: { type: "object", properties: { entitlement_uid: { type: "string" }, partner_uid: { type: "string" } }, required: ["entitlement_uid", "partner_uid"] } },
  { name: "ems_list_entitlement_partners",          description: "List channel partners associated with an entitlement.", inputSchema: { type: "object", properties: { entitlement_uid: { type: "string" } }, required: ["entitlement_uid"] } },

  // ── Namespaces ────────────────────────────────────────────────────────────
  { name: "ems_list_namespaces",    description: "List all namespaces.", inputSchema: { type: "object", properties: { limit: { type: "number" }, offset: { type: "number" } } } },
  { name: "ems_get_namespace",      description: "Get a namespace by UID.", inputSchema: { type: "object", properties: { uid: { type: "string" } }, required: ["uid"] } },
  { name: "ems_create_namespace",   description: "Create a new namespace.", inputSchema: { type: "object", properties: { name: { type: "string" }, description: { type: "string" }, refId1: { type: "string" }, refId2: { type: "string" } }, required: ["name"] } },
  { name: "ems_update_namespace",   description: "Update a namespace (PUT — full replace).", inputSchema: { type: "object", properties: { uid: { type: "string" }, name: { type: "string" }, description: { type: "string" }, state: { type: "string" }, refId1: { type: "string" }, refId2: { type: "string" } }, required: ["uid"] } },
  { name: "ems_patch_namespace",    description: "Patch a namespace (partial update).", inputSchema: { type: "object", properties: { uid: { type: "string" }, name: { type: "string" }, description: { type: "string" }, state: { type: "string" }, refId1: { type: "string" }, refId2: { type: "string" } }, required: ["uid"] } },

  // ── License Models ────────────────────────────────────────────────────────
  { name: "ems_list_license_models", description: "List all license models across all enforcements.", inputSchema: { type: "object", properties: {} } },
  { name: "ems_get_license_model",   description: "Get a specific license model by enforcement ID and UID.", inputSchema: { type: "object", properties: { enforcementId: { type: "string" }, uid: { type: "string" } }, required: ["enforcementId", "uid"] } },

  // ── License Generation ────────────────────────────────────────────────────
  { name: "ems_generate_license", description: "Generate a license file for an entitlement.", inputSchema: { type: "object", properties: { entitlement_uid: { type: "string" }, format: { type: "string", description: "License format, e.g. 'V2C' (default)" } }, required: ["entitlement_uid"] } },

  // ── Usage / Analytics ─────────────────────────────────────────────────────
  { name: "ems_get_usage_summary", description: "Get usage summary across customers and products.", inputSchema: { type: "object", properties: { customer_uid: { type: "string" }, product_uid: { type: "string" }, from: { type: "string", description: "YYYY-MM-DD" }, to: { type: "string", description: "YYYY-MM-DD" } } } },
  { name: "ems_get_usage_details", description: "Get detailed usage records.", inputSchema: { type: "object", properties: { customer_uid: { type: "string" }, feature_uid: { type: "string" }, from: { type: "string" }, to: { type: "string" } } } },

  // ── Webhooks ──────────────────────────────────────────────────────────────
  { name: "ems_list_webhooks",          description: "List all webhooks.", inputSchema: { type: "object", properties: { name: { type: "string" }, limit: { type: "number" }, offset: { type: "number" } } } },
  { name: "ems_get_webhook",            description: "Get a webhook by UID.", inputSchema: { type: "object", properties: { uid: { type: "string" } }, required: ["uid"] } },
  { name: "ems_create_webhook",         description: "Create a new webhook.", inputSchema: { type: "object", properties: { name: { type: "string" }, url: { type: "string" }, description: { type: "string" }, state: { type: "string" }, include_data: { type: "boolean" }, events: { type: "array", items: { type: "string" } }, auth_profile_uid: { type: "string" } }, required: ["name", "url"] } },
  { name: "ems_update_webhook",         description: "Update an existing webhook.", inputSchema: { type: "object", properties: { uid: { type: "string" }, name: { type: "string" }, url: { type: "string" }, description: { type: "string" }, state: { type: "string" }, include_data: { type: "boolean" }, events: { type: "array", items: { type: "string" } }, auth_profile_uid: { type: "string" } }, required: ["uid"] } },
  { name: "ems_delete_webhook",         description: "Delete a webhook.", inputSchema: { type: "object", properties: { uid: { type: "string" } }, required: ["uid"] } },
  { name: "ems_search_webhook_events",  description: "Search webhook delivery events.", inputSchema: { type: "object", properties: { webhook_uid: { type: "string" }, event_id: { type: "string" }, state: { type: "string" }, from: { type: "string" }, to: { type: "string" }, limit: { type: "number" }, offset: { type: "number" } } } },
  { name: "ems_retry_webhook_events",   description: "Retry failed webhook events.", inputSchema: { type: "object", properties: { event_ids: { type: "array", items: { type: "string" }, description: "Specific event IDs to retry; omit to retry all failed events" } } } },
];

// ─── Tool dispatcher ──────────────────────────────────────────────────────────
async function callTool(name: string, a: any): Promise<{ content: any[]; isError?: boolean }> {
  const str  = (k: string) => (a?.[k] as string  | undefined) || undefined;
  const num  = (k: string) => (a?.[k] as number  | undefined);
  const bool = (k: string) => (a?.[k] as boolean | undefined);

  try {
    let result: any;
    switch (name) {

      // ── System ─────────────────────────────────────────────────────────────
      case "ems_ping": result = await client.ping(); break;

      // ── Customers ──────────────────────────────────────────────────────────
      case "ems_list_customers":  result = await client.listCustomers({ name: str("name"), email: str("email"), limit: num("limit"), offset: num("offset") }); break;
      case "ems_get_customer":    result = await client.getCustomer(str("uid")!); break;
      case "ems_create_customer": result = await client.createCustomer(a); break;
      case "ems_update_customer": { const { uid, ...rest } = a; result = await client.updateCustomer(uid, rest); break; }
      case "ems_delete_customer": result = await client.deleteCustomer(str("uid")!); break;

      // ── Contacts ───────────────────────────────────────────────────────────
      case "ems_list_contacts":   result = await client.listContacts({ customer_uid: str("customer_uid"), email: str("email"), limit: num("limit"), offset: num("offset") }); break;
      case "ems_get_contact":     result = await client.getContact(str("uid")!); break;
      case "ems_create_contact":  result = await client.createContact(a); break;
      case "ems_update_contact":  { const { uid, ...rest } = a; result = await client.updateContact(uid, rest); break; }

      // ── Products ───────────────────────────────────────────────────────────
      case "ems_list_products":   result = await client.listProducts({ name: str("name"), limit: num("limit"), offset: num("offset") }); break;
      case "ems_get_product":     result = await client.getProduct(str("uid")!); break;
      case "ems_create_product": { const pa = { ...a }; if (typeof pa.feature_names === "string") pa.feature_names = pa.feature_names.split(",").map((s) => s.trim()).filter(Boolean); if (typeof pa.feature_uids === "string") pa.feature_uids = pa.feature_uids.split(",").map((s) => s.trim()).filter(Boolean); result = await client.createProduct(pa); break; }
      case "ems_update_product": { const { uid, ...rest } = a; if (typeof rest.feature_names === "string") rest.feature_names = rest.feature_names.split(",").map((s) => s.trim()).filter(Boolean); if (typeof rest.feature_uids === "string") rest.feature_uids = rest.feature_uids.split(",").map((s) => s.trim()).filter(Boolean); result = await client.updateProduct(uid, rest); break; }
      case "ems_delete_product":  result = await client.deleteProduct(str("uid")!); break;
      case "ems_deploy_product":  result = await client.deployProduct(str("uid")!); break;
      case "ems_add_feature_to_product": {
        const featureNames = str("feature_names")?.split(",").map(s => s.trim()).filter(Boolean) ?? [];
        const featureUids  = str("feature_uids")?.split(",").map(s => s.trim()).filter(Boolean) ?? [];
        result = await client.addFeatureToProduct({
          product_uid:   str("product_uid")!,
          feature_names: featureNames,
          feature_uids:  featureUids,
        });
        break;
      }

      // ── Features ───────────────────────────────────────────────────────────
      case "ems_list_features":   result = await client.listFeatures({ name: str("name"), limit: num("limit"), offset: num("offset") }); break;
      case "ems_get_feature":     result = await client.getFeature(str("uid")!); break;
      case "ems_create_feature":  result = await client.createFeature(a); break;
      case "ems_update_feature":  { const { uid, ...rest } = a; result = await client.updateFeature(uid, rest); break; }
      case "ems_delete_feature":  result = await client.deleteFeature(str("uid")!); break;
      case "ems_add_feature_license_model":
        result = await client.addFeatureLicenseModel(str("feature_uid")!, {
          license_model_name: str("license_model_name"),
          license_model_uid:  str("license_model_uid"),
          enforcement_uid:    str("enforcement_uid"),
          is_default:         bool("is_default") ?? true,
        });
        break;

      // ── Entitlements ───────────────────────────────────────────────────────
      case "ems_list_entitlements":         result = await client.listEntitlements({ customer_uid: str("customer_uid"), eid: str("eid"), limit: num("limit"), offset: num("offset") }); break;
      case "ems_get_entitlement":           result = await client.getEntitlement(str("uid")!); break;
      case "ems_create_entitlement":        result = await client.createEntitlement(a); break;
      case "ems_update_entitlement":        { const { uid, ...rest } = a; result = await client.updateEntitlement(uid, rest); break; }
      case "ems_enable_entitlement":        result = await client.enableEntitlement(str("uid")!); break;
      case "ems_split_entitlement":         result = await client.splitEntitlement(str("uid")!, num("qty")!, str("customer_uid")); break;
      case "ems_delete_entitlement":        result = await client.deleteEntitlement(str("uid")!); break;
      case "ems_get_entitled_features":     result = await client.getEntitledFeatures(str("uid")!); break;
      case "ems_batch_create_entitlements": result = await client.batchCreateEntitlements(a["entitlements"] as any[]); break;

      // ── Activations ────────────────────────────────────────────────────────
      case "ems_activate_entitlement":        result = await client.activateEntitlement(str("entitlement_uid")!, a["attrs"]); break;
      case "ems_list_activations":            result = await client.getActivations(str("entitlement_uid")!); break;
      case "ems_get_activation":              result = await client.getActivation(str("entitlement_uid")!, str("activation_uid")!); break;
      case "ems_deactivate":                  result = await client.deactivateActivation(str("entitlement_uid")!, str("activation_uid")!); break;
      case "ems_renew_activation":            result = await client.renewActivation(str("entitlement_uid")!, str("activation_uid")!, str("end_date")); break;
      case "ems_search_expiring_activations": result = await client.searchExpiredActivations({ customer_uid: str("customer_uid"), product_uid: str("product_uid"), days_until_expiry: num("days_until_expiry"), limit: num("limit"), offset: num("offset") }); break;
      case "ems_generate_permission_ticket":  result = await client.generatePermissionTicket(str("entitlement_uid")!, str("activation_uid")!); break;
      case "ems_generate_revocation_ticket":  result = await client.generateRevocationTicket(str("entitlement_uid")!, str("activation_uid")!, str("permission_ticket")!); break;

      // ── Activatees ─────────────────────────────────────────────────────────
      case "ems_list_activatees":   result = await client.listActivatees(str("entitlement_uid")!, str("activation_uid")!); break;
      case "ems_add_activatee":     result = await client.addActivatee(str("entitlement_uid")!, str("activation_uid")!, str("email")!, str("first_name"), str("last_name")); break;
      case "ems_remove_activatee":  result = await client.removeActivatee(str("entitlement_uid")!, str("activation_uid")!, str("activatee_uid")!); break;

      // ── Channel Partners ───────────────────────────────────────────────────
      case "ems_list_channel_partners":             result = await client.listChannelPartners({ name: str("name"), limit: num("limit"), offset: num("offset") }); break;
      case "ems_get_channel_partner":               result = await client.getChannelPartner(str("uid")!); break;
      case "ems_create_channel_partner":            result = await client.createChannelPartner(a); break;
      case "ems_update_channel_partner":            { const { uid, ...rest } = a; result = await client.updateChannelPartner(uid, rest); break; }
      case "ems_delete_channel_partner":            result = await client.deleteChannelPartner(str("uid")!); break;
      case "ems_associate_entitlement_to_partner":  result = await client.associateEntitlementToPartner(str("entitlement_uid")!, str("partner_uid")!); break;
      case "ems_remove_entitlement_from_partner":   result = await client.removeEntitlementFromPartner(str("entitlement_uid")!, str("partner_uid")!); break;
      case "ems_list_entitlement_partners":         result = await client.listEntitlementPartners(str("entitlement_uid")!); break;

      // ── Namespaces ─────────────────────────────────────────────────────────
      case "ems_list_namespaces":   result = await client.listNamespaces({ limit: num("limit"), offset: num("offset") }); break;
      case "ems_get_namespace":     result = await client.getNamespace(str("uid")!); break;
      case "ems_create_namespace":  result = await client.createNamespace(a); break;
      case "ems_update_namespace":  { const { uid, ...rest } = a; result = await client.updateNamespace(uid, rest); break; }
      case "ems_patch_namespace":   { const { uid, ...rest } = a; result = await client.patchNamespace(uid, rest); break; }

      // ── License Models ─────────────────────────────────────────────────────
      case "ems_list_license_models": result = await client.listLicenseModels(); break;
      case "ems_get_license_model":   result = await client.getLicenseModel(str("enforcementId")!, str("uid")!); break;

      // ── License Generation ─────────────────────────────────────────────────
      case "ems_generate_license": result = await client.generateLicense(str("entitlement_uid")!, str("format")); break;

      // ── Usage ──────────────────────────────────────────────────────────────
      case "ems_get_usage_summary": result = await client.getUsageSummary({ customer_uid: str("customer_uid"), product_uid: str("product_uid"), from: str("from"), to: str("to") }); break;
      case "ems_get_usage_details": result = await client.getUsageDetails({ customer_uid: str("customer_uid"), feature_uid: str("feature_uid"), from: str("from"), to: str("to") }); break;

      // ── Webhooks ───────────────────────────────────────────────────────────
      case "ems_list_webhooks":         result = await client.listWebhooks({ name: str("name"), limit: num("limit"), offset: num("offset") }); break;
      case "ems_get_webhook":           result = await client.getWebhook(str("uid")!); break;
      case "ems_create_webhook":
        result = await client.createWebhook({
          name: str("name")!, url: str("url")!,
          description: str("description"), state: str("state"),
          includeData: bool("include_data"),
          events: a["events"] as string[] | undefined,
          authProfileUid: str("auth_profile_uid"),
        });
        break;
      case "ems_update_webhook": {
        const { uid, ...wr } = a;
        result = await client.updateWebhook(uid, {
          name: wr["name"], url: wr["url"], description: wr["description"],
          state: wr["state"], includeData: wr["include_data"],
          events: wr["events"], authProfileUid: wr["auth_profile_uid"],
        });
        break;
      }
      case "ems_delete_webhook":        result = await client.deleteWebhook(str("uid")!); break;
      case "ems_search_webhook_events": result = await client.searchWebhookEvents({ webhook_uid: str("webhook_uid"), event_id: str("event_id"), state: str("state"), from: str("from"), to: str("to"), limit: num("limit"), offset: num("offset") }); break;
      case "ems_retry_webhook_events":  result = await client.retryWebhookEvents(a["event_ids"] as string[] | undefined); break;

      default:
        return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
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
          serverInfo: { name: "sentinel-ems-mcp", version: "2.1.0" },
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

app.get("/health", (_req, res) => res.json({ status: "ok", server: "sentinel-ems-mcp", version: "2.1.0" }));

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
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.write(": connected\n\n");
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