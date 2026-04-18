#!/usr/bin/env node
/**
 * Sentinel EMS MCP Server — Cloud Edition
 * Exposes Thales Sentinel EMS capabilities as MCP tools via HTTP transport.
 *
 * Configuration via environment variables:
 *   SENTINEL_EMS_URL       — e.g. https://j3p1n0.trial.sentinelcloud.com
 *   SENTINEL_EMS_USERNAME  — EMS admin username
 *   SENTINEL_EMS_PASSWORD  — EMS admin password
 *   SENTINEL_EMS_NAMESPACE_ID — (optional) default namespace UID
 *   MCP_API_KEY            — Secret key callers must pass in x-api-key header
 *   PORT                   — HTTP port (default 3000)
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import express, { Request, Response, NextFunction } from "express";
import { SentinelEmsClient } from "./ems-client.js";

// ─── Config ─────────────────────────────────────────────────────────────────

const EMS_URL = process.env.SENTINEL_EMS_URL ?? "";
const EMS_USER = process.env.SENTINEL_EMS_USERNAME ?? "admin";
const EMS_PASS = process.env.SENTINEL_EMS_PASSWORD ?? "";
const EMS_NAMESPACE = process.env.SENTINEL_EMS_NAMESPACE_ID ?? "";
const API_KEY = process.env.MCP_API_KEY ?? "";
const PORT = parseInt(process.env.PORT ?? "3000", 10);

if (!EMS_URL) {
  console.error("ERROR: SENTINEL_EMS_URL environment variable is required.");
  process.exit(1);
}

if (!API_KEY) {
  console.warn("WARNING: MCP_API_KEY is not set. Server is open to anyone with the URL.");
}

const client = new SentinelEmsClient({
  baseUrl: EMS_URL,
  username: EMS_USER,
  password: EMS_PASS,
  namespaceId: EMS_NAMESPACE,
});

// ─── Tool Definitions ────────────────────────────────────────────────────────

const TOOLS = [

  // ════════════════════════════════════════════════════════════════════════════
  // CUSTOMERS
  // ════════════════════════════════════════════════════════════════════════════
  {
    name: "ems_list_customers",
    description: "List all customers in Sentinel EMS. Supports filtering by name or email and pagination.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Filter by customer name (partial match)" },
        email: { type: "string", description: "Filter by email address" },
        limit: { type: "number", description: "Max results (default 50)" },
        offset: { type: "number", description: "Pagination offset" },
      },
    },
  },
  {
    name: "ems_get_customer",
    description: "Get full details of a single customer by their UID.",
    inputSchema: {
      type: "object",
      properties: {
        uid: { type: "string", description: "Customer UID" },
      },
      required: ["uid"],
    },
  },
  {
    name: "ems_create_customer",
    description: "Create a new customer in Sentinel EMS.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Customer / company name" },
        email: { type: "string", description: "Contact email" },
        phone: { type: "string" },
        ref_id: { type: "string", description: "Your internal CRM or reference ID" },
        contact: { type: "string", description: "Contact person name" },
        country: { type: "string" },
        city: { type: "string" },
        address: { type: "string" },
        description: { type: "string" },
      },
      required: ["name"],
    },
  },
  {
    name: "ems_update_customer",
    description: "Update fields on an existing customer.",
    inputSchema: {
      type: "object",
      properties: {
        uid: { type: "string", description: "Customer UID" },
        name: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
        contact: { type: "string" },
        country: { type: "string" },
        description: { type: "string" },
      },
      required: ["uid"],
    },
  },
  {
    name: "ems_delete_customer",
    description: "Delete a customer from Sentinel EMS. Use with caution.",
    inputSchema: {
      type: "object",
      properties: {
        uid: { type: "string", description: "Customer UID to delete" },
      },
      required: ["uid"],
    },
  },

  // ════════════════════════════════════════════════════════════════════════════
  // CONTACTS
  // ════════════════════════════════════════════════════════════════════════════
  {
    name: "ems_list_contacts",
    description: "List contacts in Sentinel EMS. Filter by customer UID or email.",
    inputSchema: {
      type: "object",
      properties: {
        customer_uid: { type: "string", description: "Filter contacts by customer UID" },
        email: { type: "string", description: "Filter by email address" },
        limit: { type: "number" },
        offset: { type: "number" },
      },
    },
  },
  {
    name: "ems_get_contact",
    description: "Get full details of a contact by UID.",
    inputSchema: {
      type: "object",
      properties: {
        uid: { type: "string", description: "Contact UID" },
      },
      required: ["uid"],
    },
  },
  {
    name: "ems_create_contact",
    description: "Create a new contact and associate with a customer.",
    inputSchema: {
      type: "object",
      properties: {
        customer_uid: { type: "string", description: "Customer UID to associate the contact with" },
        email: { type: "string", description: "Contact email address (used as login)" },
        first_name: { type: "string" },
        last_name: { type: "string" },
        phone: { type: "string" },
        description: { type: "string" },
      },
      required: ["email"],
    },
  },
  {
    name: "ems_update_contact",
    description: "Update an existing contact.",
    inputSchema: {
      type: "object",
      properties: {
        uid: { type: "string", description: "Contact UID" },
        email: { type: "string" },
        first_name: { type: "string" },
        last_name: { type: "string" },
        phone: { type: "string" },
        description: { type: "string" },
      },
      required: ["uid"],
    },
  },

  // ════════════════════════════════════════════════════════════════════════════
  // PRODUCTS
  // ════════════════════════════════════════════════════════════════════════════
  {
    name: "ems_list_products",
    description: "List all products defined in Sentinel EMS.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Filter by product name" },
        limit: { type: "number" },
        offset: { type: "number" },
      },
    },
  },
  {
    name: "ems_get_product",
    description: "Get full details of a product by UID.",
    inputSchema: {
      type: "object",
      properties: {
        uid: { type: "string", description: "Product UID" },
      },
      required: ["uid"],
    },
  },
  {
    name: "ems_create_product",
    description: "Create a new product in Sentinel EMS.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Product name" },
        version: { type: "string", description: "Product version string (e.g. '1.0')" },
        description: { type: "string" },
        namespace_name: { type: "string", description: "Namespace name to place the product in (e.g. 'Default')" },
        feature_uids: {
          type: "array",
          items: { type: "string" },
          description: "Feature UIDs to attach to this product at creation time",
        },
        feature_names: {
          type: "array",
          items: { type: "string" },
          description: "Feature names to attach to this product at creation time",
        },
        state: { type: "string", description: "Initial state: ENABLE or DRAFT. Default: ENABLE" },
      },
      required: ["name"],
    },
  },
  {
    name: "ems_update_product",
    description: "Update an existing product (name, version, description).",
    inputSchema: {
      type: "object",
      properties: {
        uid: { type: "string", description: "Product UID" },
        name: { type: "string" },
        version: { type: "string" },
        description: { type: "string" },
      },
      required: ["uid"],
    },
  },
  {
    name: "ems_delete_product",
    description: "Delete a product from Sentinel EMS. Only DRAFT products can be deleted.",
    inputSchema: {
      type: "object",
      properties: {
        uid: { type: "string", description: "Product UID" },
      },
      required: ["uid"],
    },
  },
  {
    name: "ems_deploy_product",
    description: "Deploy a product — transitions state from DRAFT to ENABLE so it can be used in entitlements.",
    inputSchema: {
      type: "object",
      properties: {
        uid: { type: "string", description: "Product UID" },
      },
      required: ["uid"],
    },
  },

  // ════════════════════════════════════════════════════════════════════════════
  // FEATURES
  // ════════════════════════════════════════════════════════════════════════════
  {
    name: "ems_list_features",
    description: "List all features defined in Sentinel EMS.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Filter by feature name" },
        limit: { type: "number" },
        offset: { type: "number" },
      },
    },
  },
  {
    name: "ems_get_feature",
    description: "Get full details of a feature by UID.",
    inputSchema: {
      type: "object",
      properties: {
        uid: { type: "string", description: "Feature UID" },
      },
      required: ["uid"],
    },
  },
  {
    name: "ems_create_feature",
    description: "Create a new licensable feature in Sentinel EMS.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Feature name" },
        description: { type: "string" },
        feature_type: { type: "string", description: "Feature type (e.g. BINARY, COUNT, DURATION)" },
        namespace_name: { type: "string", description: "Namespace name or refId1 to place the feature in (e.g. 'Default')." },
        license_model_name: { type: "string", description: "License model name to associate (e.g. 'Subscription', 'Perpetual')." },
      },
      required: ["name"],
    },
  },
  {
    name: "ems_update_feature",
    description: "Update an existing feature (name, description, type).",
    inputSchema: {
      type: "object",
      properties: {
        uid: { type: "string", description: "Feature UID" },
        name: { type: "string" },
        description: { type: "string" },
        feature_type: { type: "string" },
      },
      required: ["uid"],
    },
  },
  {
    name: "ems_delete_feature",
    description: "Delete a feature from Sentinel EMS.",
    inputSchema: {
      type: "object",
      properties: {
        uid: { type: "string", description: "Feature UID" },
      },
      required: ["uid"],
    },
  },
  {
    name: "ems_add_feature_license_model",
    description: "Associate a license model with a feature.",
    inputSchema: {
      type: "object",
      properties: {
        feature_uid: { type: "string" },
        license_model_name: { type: "string" },
        license_model_uid: { type: "string" },
        enforcement_uid: { type: "string" },
        is_default: { type: "boolean" },
      },
      required: ["feature_uid"],
    },
  },
  {
    name: "ems_remove_feature_license_model",
    description: "Remove a license model association from a feature by enforcement UID.",
    inputSchema: {
      type: "object",
      properties: {
        feature_uid: { type: "string" },
        enforcement_uid: { type: "string" },
      },
      required: ["feature_uid", "enforcement_uid"],
    },
  },

  // ════════════════════════════════════════════════════════════════════════════
  // ENTITLEMENTS
  // ════════════════════════════════════════════════════════════════════════════
  {
    name: "ems_list_entitlements",
    description: "List entitlements (license grants) in Sentinel EMS.",
    inputSchema: {
      type: "object",
      properties: {
        customer_uid: { type: "string" },
        eid: { type: "string" },
        status: { type: "string" },
        limit: { type: "number" },
        offset: { type: "number" },
      },
    },
  },
  {
    name: "ems_get_entitlement",
    description: "Get full details of an entitlement including all line items and feature grants.",
    inputSchema: {
      type: "object",
      properties: {
        uid: { type: "string" },
      },
      required: ["uid"],
    },
  },
  {
    name: "ems_create_entitlement",
    description: "Create a new entitlement for a customer.",
    inputSchema: {
      type: "object",
      properties: {
        customer_uid: { type: "string" },
        eid: { type: "string" },
        description: { type: "string" },
        is_test: { type: "boolean" },
        lines: {
          type: "array",
          items: {
            type: "object",
            properties: {
              product_uid: { type: "string" },
              feature_uid: { type: "string" },
              qty: { type: "number" },
              start_date: { type: "string" },
              end_date: { type: "string" },
              license_model: { type: "string" },
            },
            required: ["product_uid"],
          },
        },
      },
    },
  },
  {
    name: "ems_update_entitlement",
    description: "Update an existing entitlement — change customer, state, expiry, description, or notification settings.",
    inputSchema: {
      type: "object",
      properties: {
        uid: { type: "string" },
        customer_uid: { type: "string" },
        state: { type: "string", description: "DRAFT | ENABLE | DISABLE" },
        description: { type: "string" },
        send_notification: { type: "boolean" },
        cc_email: { type: "string" },
        ref_id1: { type: "string" },
        ref_id2: { type: "string" },
      },
      required: ["uid"],
    },
  },
  {
    name: "ems_complete_entitlement",
    description: "Set an entitlement to ENABLE state.",
    inputSchema: {
      type: "object",
      properties: {
        uid: { type: "string" },
      },
      required: ["uid"],
    },
  },
  {
    name: "ems_enable_entitlement",
    description: "Set an entitlement state to ENABLE.",
    inputSchema: {
      type: "object",
      properties: {
        uid: { type: "string" },
      },
      required: ["uid"],
    },
  },
  {
    name: "ems_split_entitlement",
    description: "Split an entitlement into a child entitlement with a specific quantity.",
    inputSchema: {
      type: "object",
      properties: {
        uid: { type: "string" },
        qty: { type: "number" },
        customer_uid: { type: "string" },
      },
      required: ["uid", "qty"],
    },
  },
  {
    name: "ems_delete_entitlement",
    description: "Delete / revoke an entitlement.",
    inputSchema: {
      type: "object",
      properties: {
        uid: { type: "string" },
      },
      required: ["uid"],
    },
  },
  {
    name: "ems_get_entitled_features",
    description: "Get a fast summary of all features entitled to a customer via a specific entitlement.",
    inputSchema: {
      type: "object",
      properties: {
        uid: { type: "string" },
      },
      required: ["uid"],
    },
  },
  {
    name: "ems_batch_create_entitlements",
    description: "Create multiple entitlements in a single API call.",
    inputSchema: {
      type: "object",
      properties: {
        entitlements: {
          type: "array",
          items: {
            type: "object",
            properties: {
              customer_uid: { type: "string" },
              eid: { type: "string" },
              description: { type: "string" },
              lines: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    product_uid: { type: "string" },
                    qty: { type: "number" },
                    start_date: { type: "string" },
                    end_date: { type: "string" },
                  },
                  required: ["product_uid"],
                },
              },
            },
          },
        },
      },
      required: ["entitlements"],
    },
  },

  // ════════════════════════════════════════════════════════════════════════════
  // ACTIVATIONS
  // ════════════════════════════════════════════════════════════════════════════
  {
    name: "ems_activate_entitlement",
    description: "Activate an entitlement to generate an activation key.",
    inputSchema: {
      type: "object",
      properties: {
        entitlement_uid: { type: "string" },
        attributes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              value: { type: "string" },
            },
            required: ["name", "value"],
          },
        },
      },
      required: ["entitlement_uid"],
    },
  },
  {
    name: "ems_list_activations",
    description: "List all activations for a given entitlement.",
    inputSchema: {
      type: "object",
      properties: {
        entitlement_uid: { type: "string" },
      },
      required: ["entitlement_uid"],
    },
  },
  {
    name: "ems_get_activation",
    description: "Get full details of a specific activation.",
    inputSchema: {
      type: "object",
      properties: {
        entitlement_uid: { type: "string" },
        activation_uid: { type: "string" },
      },
      required: ["entitlement_uid", "activation_uid"],
    },
  },
  {
    name: "ems_deactivate",
    description: "Deactivate (revoke) a specific activation. Frees up the seat for reuse.",
    inputSchema: {
      type: "object",
      properties: {
        entitlement_uid: { type: "string" },
        activation_uid: { type: "string" },
      },
      required: ["entitlement_uid", "activation_uid"],
    },
  },
  {
    name: "ems_renew_activation",
    description: "Renew an existing activation by extending its expiry date.",
    inputSchema: {
      type: "object",
      properties: {
        entitlement_uid: { type: "string" },
        activation_uid: { type: "string" },
        end_date: { type: "string" },
      },
      required: ["entitlement_uid", "activation_uid"],
    },
  },
  {
    name: "ems_search_expiring_activations",
    description: "Search for activations that are active but expiring soon or already expired.",
    inputSchema: {
      type: "object",
      properties: {
        customer_uid: { type: "string" },
        product_uid: { type: "string" },
        days_until_expiry: { type: "number" },
        limit: { type: "number" },
        offset: { type: "number" },
      },
    },
  },
  {
    name: "ems_generate_permission_ticket",
    description: "Step 1 of the revocation workflow. Generates a permission ticket for an activation.",
    inputSchema: {
      type: "object",
      properties: {
        entitlement_uid: { type: "string" },
        activation_uid: { type: "string" },
      },
      required: ["entitlement_uid", "activation_uid"],
    },
  },
  {
    name: "ems_generate_revocation_ticket",
    description: "Step 2 of the revocation workflow. Submit the permission ticket to get the revocation ticket.",
    inputSchema: {
      type: "object",
      properties: {
        entitlement_uid: { type: "string" },
        activation_uid: { type: "string" },
        permission_ticket: { type: "string" },
      },
      required: ["entitlement_uid", "activation_uid", "permission_ticket"],
    },
  },

  // ── Activatees ────────────────────────────────────────────────────────────
  {
    name: "ems_list_activatees",
    description: "List activatees (end users) associated with an activation.",
    inputSchema: {
      type: "object",
      properties: {
        entitlement_uid: { type: "string" },
        activation_uid: { type: "string" },
      },
      required: ["entitlement_uid", "activation_uid"],
    },
  },
  {
    name: "ems_add_activatee",
    description: "Associate an end user (activatee) with an activation.",
    inputSchema: {
      type: "object",
      properties: {
        entitlement_uid: { type: "string" },
        activation_uid: { type: "string" },
        email: { type: "string" },
        first_name: { type: "string" },
        last_name: { type: "string" },
      },
      required: ["entitlement_uid", "activation_uid", "email"],
    },
  },
  {
    name: "ems_remove_activatee",
    description: "Remove an activatee association from an activation.",
    inputSchema: {
      type: "object",
      properties: {
        entitlement_uid: { type: "string" },
        activation_uid: { type: "string" },
        activatee_uid: { type: "string" },
      },
      required: ["entitlement_uid", "activation_uid", "activatee_uid"],
    },
  },

  // ════════════════════════════════════════════════════════════════════════════
  // CHANNEL PARTNERS
  // ════════════════════════════════════════════════════════════════════════════
  {
    name: "ems_list_channel_partners",
    description: "List all channel partners in Sentinel EMS.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        limit: { type: "number" },
        offset: { type: "number" },
      },
    },
  },
  {
    name: "ems_get_channel_partner",
    description: "Get full details of a channel partner by UID.",
    inputSchema: {
      type: "object",
      properties: {
        uid: { type: "string" },
      },
      required: ["uid"],
    },
  },
  {
    name: "ems_create_channel_partner",
    description: "Create a new channel partner in Sentinel EMS.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
        country: { type: "string" },
        ref_id: { type: "string" },
        description: { type: "string" },
      },
      required: ["name"],
    },
  },
  {
    name: "ems_update_channel_partner",
    description: "Update an existing channel partner.",
    inputSchema: {
      type: "object",
      properties: {
        uid: { type: "string" },
        name: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
        country: { type: "string" },
        description: { type: "string" },
      },
      required: ["uid"],
    },
  },
  {
    name: "ems_delete_channel_partner",
    description: "Delete a channel partner from Sentinel EMS.",
    inputSchema: {
      type: "object",
      properties: {
        uid: { type: "string" },
      },
      required: ["uid"],
    },
  },
  {
    name: "ems_associate_entitlement_to_partner",
    description: "Associate an entitlement with a channel partner for distribution tracking.",
    inputSchema: {
      type: "object",
      properties: {
        entitlement_uid: { type: "string" },
        partner_uid: { type: "string" },
      },
      required: ["entitlement_uid", "partner_uid"],
    },
  },
  {
    name: "ems_remove_entitlement_from_partner",
    description: "Remove the association between an entitlement and a channel partner.",
    inputSchema: {
      type: "object",
      properties: {
        entitlement_uid: { type: "string" },
        partner_uid: { type: "string" },
      },
      required: ["entitlement_uid", "partner_uid"],
    },
  },
  {
    name: "ems_list_entitlement_partners",
    description: "List all channel partners associated with a specific entitlement.",
    inputSchema: {
      type: "object",
      properties: {
        entitlement_uid: { type: "string" },
      },
      required: ["entitlement_uid"],
    },
  },

  // ════════════════════════════════════════════════════════════════════════════
  // NAMESPACES
  // ════════════════════════════════════════════════════════════════════════════
  {
    name: "ems_list_namespaces",
    description: "List all namespaces in Sentinel EMS.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number" },
        offset: { type: "number" },
      },
    },
  },
  {
    name: "ems_get_namespace",
    description: "Get full details of a namespace by UID.",
    inputSchema: {
      type: "object",
      properties: {
        uid: { type: "string" },
      },
      required: ["uid"],
    },
  },
  {
    name: "ems_create_namespace",
    description: "Create a new namespace in Sentinel EMS.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        description: { type: "string" },
        refId1: { type: "string" },
        refId2: { type: "string" },
      },
      required: ["name"],
    },
  },
  {
    name: "ems_update_namespace",
    description: "Update a namespace using PUT — replaces the full resource.",
    inputSchema: {
      type: "object",
      properties: {
        uid: { type: "string" },
        name: { type: "string" },
        description: { type: "string" },
        state: { type: "string" },
        refId1: { type: "string" },
        refId2: { type: "string" },
      },
      required: ["uid"],
    },
  },
  {
    name: "ems_patch_namespace",
    description: "Partially update a namespace — only provided fields are changed.",
    inputSchema: {
      type: "object",
      properties: {
        uid: { type: "string" },
        name: { type: "string" },
        description: { type: "string" },
        state: { type: "string" },
        refId1: { type: "string" },
        refId2: { type: "string" },
      },
      required: ["uid"],
    },
  },

  // ════════════════════════════════════════════════════════════════════════════
  // LICENSE GENERATION
  // ════════════════════════════════════════════════════════════════════════════
  {
    name: "ems_generate_license",
    description: "Generate a license file for a given entitlement.",
    inputSchema: {
      type: "object",
      properties: {
        entitlement_uid: { type: "string" },
        format: { type: "string", description: "License format, e.g. V2C (default)" },
      },
      required: ["entitlement_uid"],
    },
  },

  // ════════════════════════════════════════════════════════════════════════════
  // USAGE
  // ════════════════════════════════════════════════════════════════════════════
  {
    name: "ems_get_usage_summary",
    description: "Get aggregated usage summary across customers and products.",
    inputSchema: {
      type: "object",
      properties: {
        customer_uid: { type: "string" },
        product_uid: { type: "string" },
        from: { type: "string" },
        to: { type: "string" },
      },
    },
  },
  {
    name: "ems_get_usage_details",
    description: "Get granular usage details by feature, customer, and date range.",
    inputSchema: {
      type: "object",
      properties: {
        customer_uid: { type: "string" },
        feature_uid: { type: "string" },
        from: { type: "string" },
        to: { type: "string" },
      },
    },
  },

  // ════════════════════════════════════════════════════════════════════════════
  // LICENSE MODELS
  // ════════════════════════════════════════════════════════════════════════════
  {
    name: "ems_list_license_models",
    description: "List all license models configured in this Sentinel EMS instance.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "ems_get_license_model",
    description: "Get full details of a single license model by UID.",
    inputSchema: {
      type: "object",
      properties: {
        enforcementId: { type: "string" },
        uid: { type: "string" },
      },
      required: ["enforcementId", "uid"],
    },
  },

  // ════════════════════════════════════════════════════════════════════════════
  // WEBHOOKS
  // ════════════════════════════════════════════════════════════════════════════
  {
    name: "ems_list_webhooks",
    description: "List all webhook subscriptions configured in Sentinel EMS.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        limit: { type: "number" },
        offset: { type: "number" },
      },
    },
  },
  {
    name: "ems_get_webhook",
    description: "Get full details of a webhook subscription by UID.",
    inputSchema: {
      type: "object",
      properties: {
        uid: { type: "string" },
      },
      required: ["uid"],
    },
  },
  {
    name: "ems_create_webhook",
    description: "Create a new webhook subscription.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        url: { type: "string" },
        description: { type: "string" },
        state: { type: "string" },
        include_data: { type: "boolean" },
        events: { type: "array", items: { type: "string" } },
        auth_profile_uid: { type: "string" },
      },
      required: ["name", "url"],
    },
  },
  {
    name: "ems_update_webhook",
    description: "Update an existing webhook subscription.",
    inputSchema: {
      type: "object",
      properties: {
        uid: { type: "string" },
        name: { type: "string" },
        url: { type: "string" },
        description: { type: "string" },
        state: { type: "string" },
        include_data: { type: "boolean" },
        events: { type: "array", items: { type: "string" } },
        auth_profile_uid: { type: "string" },
      },
      required: ["uid"],
    },
  },
  {
    name: "ems_delete_webhook",
    description: "Delete a webhook subscription from Sentinel EMS.",
    inputSchema: {
      type: "object",
      properties: {
        uid: { type: "string" },
      },
      required: ["uid"],
    },
  },
  {
    name: "ems_search_webhook_events",
    description: "Search webhook event delivery history.",
    inputSchema: {
      type: "object",
      properties: {
        webhook_uid: { type: "string" },
        event_id: { type: "string" },
        state: { type: "string" },
        from: { type: "string" },
        to: { type: "string" },
        limit: { type: "number" },
        offset: { type: "number" },
      },
    },
  },
  {
    name: "ems_retry_webhook_events",
    description: "Retry failed webhook event deliveries.",
    inputSchema: {
      type: "object",
      properties: {
        event_ids: { type: "array", items: { type: "string" } },
      },
    },
  },

  // ════════════════════════════════════════════════════════════════════════════
  // SYSTEM
  // ════════════════════════════════════════════════════════════════════════════
  {
    name: "ems_ping",
    description: "Ping the Sentinel EMS API to verify connectivity and credentials.",
    inputSchema: { type: "object", properties: {} },
  },
];

// ─── MCP Server ──────────────────────────────────────────────────────────────

const server = new Server(
  { name: "sentinel-ems-mcp", version: "2.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const a = args ?? {};

  const str = (k: string) => (a[k] as string | undefined) || undefined;
  const num = (k: string) => (a[k] as number | undefined);
  const bool = (k: string) => (a[k] as boolean | undefined);

  try {
    let result: Awaited<ReturnType<typeof client.ping>>;

    switch (name) {
      case "ems_list_customers":
        result = await client.listCustomers({ name: str("name"), email: str("email"), limit: num("limit"), offset: num("offset") });
        break;
      case "ems_get_customer":
        result = await client.getCustomer(str("uid")!);
        break;
      case "ems_create_customer":
        result = await client.createCustomer(a as Parameters<typeof client.createCustomer>[0]);
        break;
      case "ems_update_customer": {
        const { uid, ...rest } = a;
        result = await client.updateCustomer(uid as string, rest);
        break;
      }
      case "ems_delete_customer":
        result = await client.deleteCustomer(str("uid")!);
        break;

      case "ems_list_contacts":
        result = await client.listContacts({ customer_uid: str("customer_uid"), email: str("email"), limit: num("limit"), offset: num("offset") });
        break;
      case "ems_get_contact":
        result = await client.getContact(str("uid")!);
        break;
      case "ems_create_contact":
        result = await client.createContact(a as Parameters<typeof client.createContact>[0]);
        break;
      case "ems_update_contact": {
        const { uid, ...rest } = a;
        result = await client.updateContact(uid as string, rest);
        break;
      }

      case "ems_list_products":
        result = await client.listProducts({ name: str("name"), limit: num("limit"), offset: num("offset") });
        break;
      case "ems_get_product":
        result = await client.getProduct(str("uid")!);
        break;
      case "ems_create_product":
        result = await client.createProduct(a as Parameters<typeof client.createProduct>[0]);
        break;
      case "ems_update_product": {
        const { uid, ...rest } = a;
        result = await client.updateProduct(uid as string, rest);
        break;
      }
      case "ems_delete_product":
        result = await client.deleteProduct(str("uid")!);
        break;
      case "ems_deploy_product":
        result = await client.deployProduct(str("uid")!);
        break;

      case "ems_list_features":
        result = await client.listFeatures({ name: str("name"), limit: num("limit"), offset: num("offset") });
        break;
      case "ems_get_feature":
        result = await client.getFeature(str("uid")!);
        break;
      case "ems_create_feature":
        result = await client.createFeature(a as Parameters<typeof client.createFeature>[0]);
        break;
      case "ems_update_feature": {
        const { uid, ...rest } = a;
        result = await client.updateFeature(uid as string, rest);
        break;
      }
      case "ems_delete_feature":
        result = await client.deleteFeature(str("uid")!);
        break;
      case "ems_add_feature_license_model":
        result = await client.addFeatureLicenseModel(
          str("feature_uid")!,
          str("license_model_name"),
          str("license_model_uid"),
          str("enforcement_uid"),
          bool("is_default") ?? true
        );
        break;
      case "ems_remove_feature_license_model":
        result = await client.removeFeatureLicenseModel(str("feature_uid")!, str("enforcement_uid")!);
        break;

      case "ems_list_entitlements":
        result = await client.listEntitlements({ customer_uid: str("customer_uid"), eid: str("eid"), status: str("status"), limit: num("limit"), offset: num("offset") });
        break;
      case "ems_get_entitlement":
        result = await client.getEntitlement(str("uid")!);
        break;
      case "ems_create_entitlement":
        result = await client.createEntitlement(a as Parameters<typeof client.createEntitlement>[0]);
        break;
      case "ems_update_entitlement": {
        const { uid, ...rest } = a;
        result = await client.updateEntitlement(uid as string, rest as Parameters<typeof client.updateEntitlement>[1]);
        break;
      }
      case "ems_complete_entitlement":
        result = await client.completeEntitlement(str("uid")!);
        break;
      case "ems_enable_entitlement":
        result = await client.enableEntitlement(str("uid")!);
        break;
      case "ems_split_entitlement":
        result = await client.splitEntitlement(str("uid")!, num("qty")!, str("customer_uid"));
        break;
      case "ems_delete_entitlement":
        result = await client.deleteEntitlement(str("uid")!);
        break;
      case "ems_get_entitled_features":
        result = await client.getEntitledFeatures(str("uid")!);
        break;
      case "ems_batch_create_entitlements":
        result = await client.batchCreateEntitlements(a["entitlements"] as Parameters<typeof client.batchCreateEntitlements>[0]);
        break;

      case "ems_activate_entitlement":
        result = await client.activateEntitlement(str("entitlement_uid")!, a["attributes"] as Parameters<typeof client.activateEntitlement>[1]);
        break;
      case "ems_list_activations":
        result = await client.getActivations(str("entitlement_uid")!);
        break;
      case "ems_get_activation":
        result = await client.getActivation(str("entitlement_uid")!, str("activation_uid")!);
        break;
      case "ems_deactivate":
        result = await client.deactivateActivation(str("entitlement_uid")!, str("activation_uid")!);
        break;
      case "ems_renew_activation":
        result = await client.renewActivation(str("entitlement_uid")!, str("activation_uid")!, str("end_date"));
        break;
      case "ems_search_expiring_activations":
        result = await client.searchExpiredActivations({ customer_uid: str("customer_uid"), product_uid: str("product_uid"), days_until_expiry: num("days_until_expiry"), limit: num("limit"), offset: num("offset") });
        break;
      case "ems_generate_permission_ticket":
        result = await client.generatePermissionTicket(str("entitlement_uid")!, str("activation_uid")!);
        break;
      case "ems_generate_revocation_ticket":
        result = await client.generateRevocationTicket(str("entitlement_uid")!, str("activation_uid")!, str("permission_ticket")!);
        break;

      case "ems_list_activatees":
        result = await client.listActivatees(str("entitlement_uid")!, str("activation_uid")!);
        break;
      case "ems_add_activatee":
        result = await client.addActivatee(str("entitlement_uid")!, str("activation_uid")!, str("email")!, str("first_name"), str("last_name"));
        break;
      case "ems_remove_activatee":
        result = await client.removeActivatee(str("entitlement_uid")!, str("activation_uid")!, str("activatee_uid")!);
        break;

      case "ems_list_channel_partners":
        result = await client.listChannelPartners({ name: str("name"), limit: num("limit"), offset: num("offset") });
        break;
      case "ems_get_channel_partner":
        result = await client.getChannelPartner(str("uid")!);
        break;
      case "ems_create_channel_partner":
        result = await client.createChannelPartner(a as Parameters<typeof client.createChannelPartner>[0]);
        break;
      case "ems_update_channel_partner": {
        const { uid, ...rest } = a;
        result = await client.updateChannelPartner(uid as string, rest);
        break;
      }
      case "ems_delete_channel_partner":
        result = await client.deleteChannelPartner(str("uid")!);
        break;
      case "ems_associate_entitlement_to_partner":
        result = await client.associateEntitlementToPartner(str("entitlement_uid")!, str("partner_uid")!);
        break;
      case "ems_remove_entitlement_from_partner":
        result = await client.removeEntitlementFromPartner(str("entitlement_uid")!, str("partner_uid")!);
        break;
      case "ems_list_entitlement_partners":
        result = await client.listEntitlementPartners(str("entitlement_uid")!);
        break;

      case "ems_list_namespaces":
        result = await client.listNamespaces({ limit: num("limit"), offset: num("offset") });
        break;
      case "ems_get_namespace":
        result = await client.getNamespace(str("uid")!);
        break;
      case "ems_create_namespace":
        result = await client.createNamespace(a as Parameters<typeof client.createNamespace>[0]);
        break;
      case "ems_update_namespace": {
        const { uid, ...rest } = a;
        result = await client.updateNamespace(uid as string, rest as Parameters<typeof client.updateNamespace>[1]);
        break;
      }
      case "ems_patch_namespace": {
        const { uid, ...rest } = a;
        result = await client.patchNamespace(uid as string, rest as Parameters<typeof client.patchNamespace>[1]);
        break;
      }

      case "ems_generate_license":
        result = await client.generateLicense(str("entitlement_uid")!, str("format"));
        break;

      case "ems_get_usage_summary":
        result = await client.getUsageSummary({ customer_uid: str("customer_uid"), product_uid: str("product_uid"), from: str("from"), to: str("to") });
        break;
      case "ems_get_usage_details":
        result = await client.getUsageDetails({ customer_uid: str("customer_uid"), feature_uid: str("feature_uid"), from: str("from"), to: str("to") });
        break;

      case "ems_list_license_models":
        result = await client.listLicenseModels();
        break;
      case "ems_get_license_model":
        result = await client.getLicenseModel(str("enforcementId")!, str("uid")!);
        break;

      case "ems_list_webhooks":
        result = await client.listWebhooks({ name: str("name"), limit: num("limit"), offset: num("offset") });
        break;
      case "ems_get_webhook":
        result = await client.getWebhook(str("uid")!);
        break;
      case "ems_create_webhook":
        result = await client.createWebhook({ name: str("name")!, url: str("url")!, description: str("description"), state: str("state"), includeData: bool("include_data"), events: a["events"] as string[] | undefined, authProfileUid: str("auth_profile_uid") });
        break;
      case "ems_update_webhook": {
        const { uid, ...rest } = a;
        result = await client.updateWebhook(uid as string, { name: rest["name"] as string | undefined, url: rest["url"] as string | undefined, description: rest["description"] as string | undefined, state: rest["state"] as string | undefined, includeData: rest["include_data"] as boolean | undefined, events: rest["events"] as string[] | undefined, authProfileUid: rest["auth_profile_uid"] as string | undefined });
        break;
      }
      case "ems_delete_webhook":
        result = await client.deleteWebhook(str("uid")!);
        break;
      case "ems_search_webhook_events":
        result = await client.searchWebhookEvents({ webhook_uid: str("webhook_uid"), event_id: str("event_id"), state: str("state"), from: str("from"), to: str("to"), limit: num("limit"), offset: num("offset") });
        break;
      case "ems_retry_webhook_events":
        result = await client.retryWebhookEvents(a["event_ids"] as string[] | undefined);
        break;

      case "ems_ping":
        result = await client.ping();
        break;

      default:
        return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
    }

    const text = result.ok
      ? (result.data !== undefined ? JSON.stringify(result.data, null, 2) : "204 No Content - Operation successful")
      : `Error ${result.status}: ${result.error ?? JSON.stringify(result.data)}`;

    return { content: [{ type: "text", text }], isError: !result.ok };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: [{ type: "text", text: `Tool execution error: ${message}` }], isError: true };
  }
});

// ─── Express App ─────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());

// API key middleware
app.use("/mcp", (req: Request, res: Response, next: NextFunction) => {
  if (!API_KEY) return next(); // no key set = open access
  const provided = req.headers["x-api-key"];
  if (provided !== API_KEY) {
    res.status(401).json({ error: "Unauthorized: invalid or missing x-api-key header" });
    return;
  }
  next();
});

// Health check (no auth required)
app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", server: "sentinel-ems-mcp", version: "2.0.0" });
});

// MCP endpoint
const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
server.connect(transport).then(() => {
  app.post("/mcp", (req: Request, res: Response) => transport.handleRequest(req, res));
  app.get("/mcp",  (req: Request, res: Response) => transport.handleRequest(req, res));
  app.delete("/mcp", (req: Request, res: Response) => transport.handleRequest(req, res));

  app.listen(PORT, () => {
    console.log(`Sentinel EMS MCP server listening on port ${PORT}`);
    console.log(`MCP endpoint: http://localhost:${PORT}/mcp`);
    console.log(`Health check: http://localhost:${PORT}/health`);
    console.log(`API key protection: ${API_KEY ? "enabled" : "disabled"}`);
  });
});
