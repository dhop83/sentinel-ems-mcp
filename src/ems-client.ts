/**
 * Sentinel EMS API Client
 * Wraps the Sentinel EMS v5 REST API with Basic Auth
 *
 * Configuration via environment variables (set in claude_desktop_config.json):
 *   SENTINEL_EMS_URL       — e.g. https://j3p1n0.trial.sentinelcloud.com
 *   SENTINEL_EMS_USERNAME  — EMS admin username
 *   SENTINEL_EMS_PASSWORD  — EMS admin password
 */

export interface EmsConfig {
  baseUrl: string;
  username: string;
  password: string;
  namespaceId?: string;
}

export interface Customer {
  uid?: string;
  name: string;
  email?: string;
  phone?: string;
  ref_id?: string;
  contact?: string;
  country?: string;
  city?: string;
  state?: string;
  address?: string;
  zip?: string;
  description?: string;
}

export interface Contact {
  uid?: string;
  customer_uid?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  description?: string;
}

export interface Product {
  uid?: string;
  name: string;
  version?: string;
  description?: string;
  product_key?: string;
  namespace_name?: string;       // Namespace name to place the product in (e.g. 'Default')
  feature_names?: string[];      // Feature names to attach as productFeatures at creation time
  feature_uids?: string[];       // Feature UIDs to attach as productFeatures at creation time
  state?: string;                // ENABLE or DRAFT (default ENABLE)
}

export interface Feature {
  uid?: string;
  name: string;
  description?: string;
  feature_type?: string;
  namespace_name?: string;   // resolve namespace by name or refId1 at creation time
  license_model_name?: string; // resolve license model + enforcement by name at creation time
}

export interface EntitlementLine {
  product_uid: string;
  feature_uid?: string;
  qty?: number;
  start_date?: string;
  end_date?: string;
  license_model?: string;
}

export interface Entitlement {
  uid?: string;
  customer_uid?: string;
  eid?: string;
  description?: string;
  is_test?: boolean;         // true = test entitlement, supports draft products
  lines?: EntitlementLine[];
}

export interface EntitlementUpdate {
  customer_uid?: string;
  state?: string;           // DRAFT | ENABLE | DISABLE
  description?: string;
  start_date?: string;
  end_date?: string;
  send_notification?: boolean;
  cc_email?: string;
  ref_id1?: string;
  ref_id2?: string;
}

export interface ActivationAttribute {
  name: string;
  value: string;
}

export interface ChannelPartner {
  uid?: string;
  name: string;
  email?: string;
  phone?: string;
  description?: string;
  ref_id?: string;
  country?: string;
}

export interface Namespace {
  uid?: string;
  name: string;
  description?: string;
  state?: string;           // DRAFT | ENABLE | DISABLE
  refId1?: string;
  refId2?: string;
}

export interface Webhook {
  uid?: string;
  name: string;
  url: string;
  description?: string;
  state?: string;           // ENABLE | DISABLE
  includeData?: boolean;
  events?: string[];
  authProfileUid?: string;
}

export interface WebhookEventSearchParams extends PaginationParams {
  webhook_uid?: string;
  event_id?: string;
  state?: string;           // SUCCESS | FAILED | IN_PROGRESS
  from?: string;            // YYYY-MM-DD HH:MM
  to?: string;
}

export interface PaginationParams {
  limit?: number;
  offset?: number;
}

export type ApiResponse<T = unknown> = {
  data?: T;
  status: number;
  ok: boolean;
  error?: string;
};

export class SentinelEmsClient {
  private baseUrl: string;
  private apiBase: string;
  private authHeader: string;
  private namespaceId: string;

  constructor(config: EmsConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.apiBase = `${this.baseUrl}/ems/api/v5`;
    const encoded = Buffer.from(`${config.username}:${config.password}`).toString("base64");
    this.authHeader = `Basic ${encoded}`;
    this.namespaceId = config.namespaceId ?? "";
  }

  // ─── Core request ────────────────────────────────────────────────────────────

  private async request<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
    params?: Record<string, string | number | boolean>
  ): Promise<ApiResponse<T>> {
    let url = `${this.apiBase}${path}`;

    if (params && Object.keys(params).length > 0) {
      const qs = new URLSearchParams(
        Object.entries(params)
          .filter(([, v]) => v !== undefined && v !== null && v !== "")
          .map(([k, v]) => [k, String(v)])
      ).toString();
      url += `?${qs}`;
    }

    const headers: Record<string, string> = {
      Authorization: this.authHeader,
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    let data: T | undefined;
    let error: string | undefined;

    try {
      const text = await res.text();
      if (text) data = JSON.parse(text) as T;
    } catch {
      error = "Failed to parse response";
    }

    if (!res.ok && !error) {
      const bodyText = data !== undefined ? ` — ${JSON.stringify(data)}` : "";
      error = `HTTP ${res.status}: ${res.statusText}${bodyText}`;
    }

    return { data, status: res.status, ok: res.ok, error };
  }

  // ─── Customers ───────────────────────────────────────────────────────────────

  async listCustomers(params?: PaginationParams & { name?: string; email?: string }) {
    return this.request("GET", "/customers", undefined, {
      pageSize: params?.limit ?? 50,
      ...(params?.offset !== undefined && { offset: params.offset }),
      ...(params?.name && { name: params.name }),
      ...(params?.email && { email: params.email }),
    });
  }

  async getCustomer(uid: string) {
    return this.request("GET", `/customers/${uid}`);
  }

  async createCustomer(customer: Customer) {
    return this.request("POST", "/customers", { customer });
  }

  async updateCustomer(uid: string, customer: Partial<Customer>) {
    return this.request("PUT", `/customers/${uid}`, { customer });
  }

  async deleteCustomer(uid: string) {
    return this.request("DELETE", `/customers/${uid}`);
  }

  // ─── Contacts ────────────────────────────────────────────────────────────────

  async listContacts(params?: PaginationParams & { customer_uid?: string; email?: string }) {
    return this.request("GET", "/contacts", undefined, {
      pageSize: params?.limit ?? 50,
      ...(params?.offset !== undefined && { offset: params.offset }),
      ...(params?.customer_uid && { customerUid: params.customer_uid }),
      ...(params?.email && { email: params.email }),
    });
  }

  async getContact(uid: string) {
    return this.request("GET", `/contacts/${uid}`);
  }

  async createContact(contact: Contact) {
    const body: Record<string, unknown> = {};
    if (contact.customer_uid) body.customer = { id: contact.customer_uid };
    if (contact.first_name) body.firstName = contact.first_name;
    if (contact.last_name) body.lastName = contact.last_name;
    if (contact.email) body.emailId = contact.email;
    if (contact.phone) body.phone = contact.phone;
    if (contact.description) body.description = contact.description;
    return this.request("POST", "/contacts", { contact: body });
  }

  async updateContact(uid: string, contact: Partial<Contact>) {
    const body: Record<string, unknown> = {};
    if (contact.customer_uid) body.customer = { id: contact.customer_uid };
    if (contact.first_name) body.firstName = contact.first_name;
    if (contact.last_name) body.lastName = contact.last_name;
    if (contact.email) body.emailId = contact.email;
    if (contact.phone) body.phone = contact.phone;
    if (contact.description) body.description = contact.description;
    return this.request("PUT", `/contacts/${uid}`, { contact: body });
  }

  // ─── Products ────────────────────────────────────────────────────────────────

  async listProducts(params?: PaginationParams & { name?: string }) {
    return this.request("GET", "/products", undefined, {
      embed: "productFeatures,customAttributes,productAttributes,parentProduct",
      sortByDesc: "creationDate",
      pageSize: params?.limit ?? 50,
      productType: "CHILD,DEFAULT",
      ...(params?.offset !== undefined && { offset: params.offset }),
      ...(params?.name && { name: params.name }),
    });
  }

  async getProduct(uid: string) {
    return this.request("GET", `/products/${uid}`, undefined, {
      embed: "productFeatures,customAttributes,productAttributes",
    });
  }

  async createProduct(product: Product) {
    // Build the correctly nested EMS API body
    // API expects: { product: { namespace, nameVersion, productFeatures, ... } }
    const body: Record<string, unknown> = {};

    // Namespace: prefer explicit namespace_name, fall back to server default namespaceId
    if (product.namespace_name) {
      body.namespace = { name: product.namespace_name };
    } else if (this.namespaceId) {
      body.namespace = { id: this.namespaceId };
    }

    // nameVersion: EMS requires name/version nested, not flat
    body.nameVersion = {
      name: product.name,
      version: product.version ?? "",
    };

    if (product.description) body.description = product.description;
    if (product.state) body.state = product.state;

    // Attach features at creation time if provided
    const featureRefs: Record<string, unknown>[] = [];
    if (product.feature_uids?.length) {
      product.feature_uids.forEach(uid => {
        featureRefs.push({ feature: { id: uid } });
      });
    } else if (product.feature_names?.length) {
      product.feature_names.forEach(name => {
        featureRefs.push({ feature: { nameVersion: { name } } });
      });
    }
    if (featureRefs.length) {
      body.productFeatures = { productFeature: featureRefs };
    }

    return this.request("POST", "/products", { product: body });
  }

  async updateProduct(uid: string, product: Partial<Product>) {
    return this.request("PUT", `/products/${uid}`, { product });
  }

  async deleteProduct(uid: string) {
    return this.request("DELETE", `/products/${uid}`);
  }

  async deployProduct(uid: string) {
    // Transitions product state from DRAFT → ENABLE via PATCH
    // EMS has no /deploy endpoint — state change is done via PATCH on the product resource
    return this.request("PATCH", `/products/${uid}`, { product: { state: "ENABLE" } });
  }

  // ─── Features ────────────────────────────────────────────────────────────────

  // ─── Resolution helpers ───────────────────────────────────────────────────

  /** Resolve a namespace UID by matching name or refId1 (case-insensitive). */
  private async resolveNamespaceUid(nameOrRefId: string): Promise<string> {
    const res = await this.listNamespaces({ limit: 100 });
    if (!res.ok || !res.data) throw new Error(`Failed to list namespaces: ${res.error}`);
    const list = (res.data as any)?.namespaces?.namespace ?? [];
    const match = list.find(
      (ns: any) =>
        ns.name?.toLowerCase() === nameOrRefId.toLowerCase() ||
        ns.refId1?.toLowerCase() === nameOrRefId.toLowerCase()
    );
    if (!match) throw new Error(`Namespace not found: "${nameOrRefId}"`);
    return match.id as string;
  }

  /** Resolve a license model UID and its enforcement UID by license model name (case-insensitive). */
  private async resolveLicenseModel(name: string): Promise<{ lmUid: string; enforcementUid: string }> {
    const res = await this.listLicenseModels();
    if (!res.ok || !res.data) throw new Error(`Failed to list license models: ${res.error}`);
    const list = (res.data as any)?.licenseModels?.licenseModel ?? [];
    const match = list.find((lm: any) => lm.name?.toLowerCase() === name.toLowerCase());
    if (!match) throw new Error(`License model not found: "${name}"`);
    const lmUid = match.id as string;

    // Prefer enforcement tagged during aggregation (avoids a second API call)
    if (match._enforcement?.id) {
      return { lmUid, enforcementUid: match._enforcement.id as string };
    }

    // Fallback: enforcement is always tagged by listLicenseModels aggregation above.
    // getLicenseModel now requires enforcementId, so we throw a clear error if missing.
    throw new Error(`No enforcement found on license model "${name}" — listLicenseModels did not return enforcement-tagged results`);
  }
  // ─── Features ────────────────────────────────────────────────────────────────

  async listFeatures(params?: PaginationParams & { name?: string }) {
    return this.request("GET", "/features", undefined, {
      embed: "featureLicenseModels,customAttributes",
      sortByDesc: "creationDate",
      pageSize: params?.limit ?? 50,
      ...(params?.offset !== undefined && { offset: params.offset }),
      ...(params?.name && { name: params.name }),
    });
  }

  async getFeature(uid: string) {
    return this.request("GET", `/features/${uid}`);
  }

  async createFeature(feature: Feature) {
    // Resolve namespace: prefer explicit namespace_name arg, fall back to env-configured namespaceId
    let namespaceId = this.namespaceId;
    if (feature.namespace_name) {
      namespaceId = await this.resolveNamespaceUid(feature.namespace_name);
    }
    if (!namespaceId) throw new Error("namespace_name is required (or set SENTINEL_EMS_NAMESPACE_ID)");

    // Resolve license model + enforcement by name if provided
    let featureLicenseModels: unknown = undefined;
    if (feature.license_model_name) {
      const { lmUid, enforcementUid } = await this.resolveLicenseModel(feature.license_model_name);
      featureLicenseModels = {
        featureLicenseModel: [{
          enforcement: { id: enforcementUid },
          licenseModel: { id: lmUid },
          isDefault: true,
        }],
      };
    }

    const body: Record<string, unknown> = {
      nameVersion: { name: feature.name, version: "" },
      namespace: { id: namespaceId },
    };
    if (feature.description) body.description = feature.description;
    if (featureLicenseModels) body.featureLicenseModels = featureLicenseModels;

    return this.request("POST", "/features", { feature: body });
  }

  async updateFeature(uid: string, feature: Partial<Feature>) {
    return this.request("PUT", `/features/${uid}`, { feature });
  }

  async deleteFeature(uid: string) {
    return this.request("DELETE", `/features/${uid}`);
  }

  /**
   * Associate a license model (+ its enforcement) with a feature.
   * If license_model_name is supplied, the enforcement is resolved automatically.
   * Alternatively pass license_model_uid + enforcement_uid directly.
   */
  async addFeatureLicenseModel(
    featureUid: string,
    opts: {
      license_model_name?: string;
      license_model_uid?: string;
      enforcement_uid?: string;
      is_default?: boolean;
    }
  ) {
    let lmUid: string;
    let enforcementUid: string;

    if (opts.license_model_name) {
      const resolved = await this.resolveLicenseModel(opts.license_model_name);
      lmUid = resolved.lmUid;
      enforcementUid = resolved.enforcementUid;
    } else if (opts.license_model_uid && opts.enforcement_uid) {
      lmUid = opts.license_model_uid;
      enforcementUid = opts.enforcement_uid;
    } else {
      throw new Error("Provide license_model_name OR both license_model_uid and enforcement_uid");
    }

    return this.request("POST", `/features/${featureUid}/featureLicenseModels`, {
      featureLicenseModel: {
        enforcement: { id: enforcementUid },
        licenseModel: { id: lmUid },
        isDefault: opts.is_default ?? true,
      },
    });
  }

  /** Remove a license model association from a feature by enforcement UID. */
  async removeFeatureLicenseModel(featureUid: string, enforcementUid: string) {
    return this.request("DELETE", `/features/${featureUid}/featureLicenseModels/${enforcementUid}`);
  }

  // ─── Entitlements ────────────────────────────────────────────────────────────

  async listEntitlements(params?: PaginationParams & {
    customer_uid?: string;
    eid?: string;
    status?: string;
  }) {
    return this.request("GET", "/entitlements", undefined, {
      embed: "productKeys,customer",
      pageSize: params?.limit ?? 50,
      ...(params?.offset !== undefined && { offset: params.offset }),
      ...(params?.customer_uid && { customerUid: params.customer_uid }),
      ...(params?.eid && { eid: params.eid }),
      ...(params?.status && { state: params.status }),
    });
  }

  async getEntitlement(uid: string) {
    return this.request("GET", `/entitlements/${uid}`, undefined, {
      embed: "productKeys,customer,activations",
    });
  }

  async createEntitlement(entitlement: Entitlement) {
    const body: Record<string, unknown> = {};

    if (entitlement.customer_uid) {
      body.customer = { id: entitlement.customer_uid };
    }

    if (entitlement.eid) body.eId = entitlement.eid;
    if (entitlement.description) body.description = entitlement.description;
    if (entitlement.is_test !== undefined) body.isTest = entitlement.is_test;

    if (entitlement.lines && entitlement.lines.length > 0) {
      body.productKeys = {
        productKey: entitlement.lines.map((line) => {
          const pk: Record<string, unknown> = {
            item: {
              itemProduct: {
                product: { id: line.product_uid },
              },
            },
            totalQuantity: line.qty ?? 1,
            activationMethod: "FIXED",
            fixedQuantity: 1,
          };

          if (line.end_date) {
            pk.expiry = { neverExpires: false, endDate: line.end_date };
          } else {
            pk.expiry = { neverExpires: true };
          }

          if (line.start_date) pk.startDate = line.start_date;

          return pk;
        }),
      };
    }

    return this.request("POST", "/entitlements", { entitlement: body });
  }

  async updateEntitlement(uid: string, update: EntitlementUpdate) {
    // PATCH — partial update, only provided fields are changed
    const body: Record<string, unknown> = {};
    if (update.customer_uid) body.customer = { id: update.customer_uid };
    if (update.state) body.state = update.state;
    if (update.description !== undefined) body.description = update.description;
    if (update.send_notification !== undefined) body.sendNotification = update.send_notification;
    if (update.cc_email !== undefined) body.ccEmail = update.cc_email;
    if (update.ref_id1 !== undefined) body.refId1 = update.ref_id1;
    if (update.ref_id2 !== undefined) body.refId2 = update.ref_id2;
    return this.request("PATCH", `/entitlements/${uid}`, { entitlement: body });
  }

  async enableEntitlement(uid: string) {
    // Transitions entitlement DRAFT → ENABLE. Valid states: DRAFT | ENABLE | DISABLE
    return this.request("PATCH", `/entitlements/${uid}`, {
      entitlement: { state: "ENABLE" },
    });
  }

  async completeEntitlement(uid: string) {
    // Alias for enableEntitlement — there is no COMPLETE state in EMS
    return this.enableEntitlement(uid);
  }

  async splitEntitlement(uid: string, qty: number, customer_uid?: string) {
    const body: Record<string, unknown> = { splitQuantity: qty };
    if (customer_uid) body.customer = { id: customer_uid };
    return this.request("POST", `/entitlements/${uid}/split`, body);
  }

  async deleteEntitlement(uid: string) {
    return this.request("DELETE", `/entitlements/${uid}`);
  }

  async getEntitledFeatures(uid: string) {
    // Fast lookup — returns summary of features entitled to a customer via this entitlement.
    // Includes product association, available/remaining quantities, and enabled/disabled status.
    return this.request("GET", `/entitlements/${uid}/entitledFeatures`);
  }

  async batchCreateEntitlements(entitlements: Entitlement[]) {
    // Create multiple entitlements in one API call
    const items = entitlements.map((entitlement) => {
      const body: Record<string, unknown> = {};
      if (entitlement.customer_uid) body.customer = { id: entitlement.customer_uid };
      if (entitlement.eid) body.eId = entitlement.eid;
      if (entitlement.description) body.description = entitlement.description;
      if (entitlement.lines && entitlement.lines.length > 0) {
        body.productKeys = {
          productKey: entitlement.lines.map((line) => {
            const pk: Record<string, unknown> = {
              item: { itemProduct: { product: { id: line.product_uid } } },
              totalQuantity: line.qty ?? 1,
              activationMethod: "FIXED",
              fixedQuantity: 1,
            };
            if (line.end_date) {
              pk.expiry = { neverExpires: false, endDate: line.end_date };
            } else {
              pk.expiry = { neverExpires: true };
            }
            if (line.start_date) pk.startDate = line.start_date;
            return pk;
          }),
        };
      }
      return body;
    });
    return this.request("POST", "/entitlements/batch", { entitlements: { entitlement: items } });
  }

  // ─── Activations ─────────────────────────────────────────────────────────────

  async activateEntitlement(entitlementUid: string, attrs?: ActivationAttribute[]) {
    // Correct endpoint per EMS API docs: POST /ems/api/v5/activations/bulkActivate
    // Must supply the product key(s) from the entitlement.
    // Fetch entitlement first to discover productKey(s) and quantity.
    const entRes = await this.getEntitlement(entitlementUid);
    if (!entRes.ok || !entRes.data) {
      return { data: entRes.data, status: entRes.status, ok: false, error: `Failed to fetch entitlement: ${entRes.error}` };
    }

    const ent: any = (entRes.data as any).entitlement ?? entRes.data;
    const productKeys: any[] = ent?.productKeys?.productKey ?? [];

    if (productKeys.length === 0) {
      return { status: 400, ok: false, error: "Entitlement has no product keys to activate" };
    }

    // Build productActivation array — one per product key
    const productActivations = productKeys.map((pk: any) => ({
      productKey: { id: pk.id },
      quantity: pk.totalQty ?? pk.remainingQty ?? 1,
      activationAttributes: attrs && attrs.length > 0 ? { attributes: { attribute: attrs } } : undefined,
    }));

    const body = {
      activationData: {
        entitlement: { id: entitlementUid },
        productActivations: { productActivation: productActivations },
      },
      returnResource: "V2C",
    };

    return this.request("POST", "/activations/bulkActivate", body);
  }

  async getActivations(entitlementUid: string) {
    return this.request("GET", `/entitlements/${entitlementUid}/activations`);
  }

  async getActivation(entitlementUid: string, activationUid: string) {
    return this.request("GET", `/entitlements/${entitlementUid}/activations/${activationUid}`);
  }

  async deactivateActivation(entitlementUid: string, activationUid: string) {
    return this.request("DELETE", `/entitlements/${entitlementUid}/activations/${activationUid}`);
  }

  async renewActivation(entitlementUid: string, activationUid: string, end_date?: string) {
    const body: Record<string, unknown> = {};
    if (end_date) body.expiry = { neverExpires: false, endDate: end_date };
    return this.request("POST", `/entitlements/${entitlementUid}/activations/${activationUid}/renew`, body);
  }

  async searchExpiredActivations(params?: PaginationParams & {
    customer_uid?: string;
    product_uid?: string;
    days_until_expiry?: number;
  }) {
    return this.request("GET", "/activations", undefined, {
      embed: "customer,product",
      state: "ACTIVE",
      pageSize: params?.limit ?? 50,
      ...(params?.offset !== undefined && { offset: params.offset }),
      ...(params?.customer_uid && { customerUid: params.customer_uid }),
      ...(params?.product_uid && { productUid: params.product_uid }),
      ...(params?.days_until_expiry !== undefined && {
        expiresInDays: params.days_until_expiry,
      }),
    });
  }

  async generatePermissionTicket(entitlementUid: string, activationUid: string) {
    // Step 1 of revocation workflow: generate permission ticket
    return this.request(
      "POST",
      `/activations/${activationUid}/generatePermissionTickets`,
      { entitlementUid }
    );
  }

  async generateRevocationTicket(
    entitlementUid: string,
    activationUid: string,
    permissionTicket: string
  ) {
    // Step 2 of revocation workflow: submit C2V / permission ticket, get revocation ticket
    return this.request(
      "POST",
      `/activations/${activationUid}/revoke`,
      { permissionTicket, entitlementUid }
    );
  }

  async listActivatees(entitlementUid: string, activationUid: string) {
    return this.request(
      "GET",
      `/entitlements/${entitlementUid}/activations/${activationUid}/activatees`
    );
  }

  async addActivatee(
    entitlementUid: string,
    activationUid: string,
    email: string,
    first_name?: string,
    last_name?: string
  ) {
    return this.request(
      "POST",
      `/entitlements/${entitlementUid}/activations/${activationUid}/activatees`,
      {
        activatee: {
          emailId: email,
          ...(first_name && { firstName: first_name }),
          ...(last_name && { lastName: last_name }),
        },
      }
    );
  }

  async removeActivatee(
    entitlementUid: string,
    activationUid: string,
    activateeUid: string
  ) {
    return this.request(
      "DELETE",
      `/entitlements/${entitlementUid}/activations/${activationUid}/activatees/${activateeUid}`
    );
  }

  // ─── License Generation ──────────────────────────────────────────────────────

  async generateLicense(entitlementUid: string, format?: string) {
    return this.request("POST", `/entitlements/${entitlementUid}/generate`, {
      format: format ?? "V2C",
    });
  }

  // ─── Namespaces ──────────────────────────────────────────────────────────────

  async listNamespaces(params?: PaginationParams) {
    return this.request("GET", "/namespaces", undefined, {
      pageSize: params?.limit ?? 50,
      ...(params?.offset !== undefined && { offset: params.offset }),
    });
  }

  async getNamespace(uid: string) {
    return this.request("GET", `/namespaces/${uid}`);
  }

  async createNamespace(ns: Namespace) {
    const body: Record<string, unknown> = { name: ns.name };
    if (ns.description) body.description = ns.description;
    if (ns.refId1) body.refId1 = ns.refId1;
    if (ns.refId2) body.refId2 = ns.refId2;
    return this.request("POST", "/namespaces", { namespace: body });
  }

  async updateNamespace(uid: string, ns: Partial<Namespace>) {
    // PUT — replaces the resource; omitted fields revert to default
    const body: Record<string, unknown> = {};
    if (ns.name) body.name = ns.name;
    if (ns.description !== undefined) body.description = ns.description;
    if (ns.state) body.state = ns.state;
    if (ns.refId1 !== undefined) body.refId1 = ns.refId1;
    if (ns.refId2 !== undefined) body.refId2 = ns.refId2;
    return this.request("PUT", `/namespaces/${uid}`, { namespace: body });
  }

  async patchNamespace(uid: string, ns: Partial<Namespace>) {
    // PATCH — partial update; only provided fields are changed
    const body: Record<string, unknown> = {};
    if (ns.name) body.name = ns.name;
    if (ns.description !== undefined) body.description = ns.description;
    if (ns.state) body.state = ns.state;
    if (ns.refId1 !== undefined) body.refId1 = ns.refId1;
    if (ns.refId2 !== undefined) body.refId2 = ns.refId2;
    return this.request("PATCH", `/namespaces/${uid}`, { namespace: body });
  }

  // ─── Channel Partners ────────────────────────────────────────────────────────

  async listChannelPartners(params?: PaginationParams & { name?: string }) {
    return this.request("GET", "/channelPartners", undefined, {
      pageSize: params?.limit ?? 50,
      ...(params?.offset !== undefined && { offset: params.offset }),
      ...(params?.name && { name: params.name }),
    });
  }

  async getChannelPartner(uid: string) {
    return this.request("GET", `/channelPartners/${uid}`);
  }

  async createChannelPartner(partner: ChannelPartner) {
    return this.request("POST", "/channelPartners", { channelPartner: partner });
  }

  async updateChannelPartner(uid: string, partner: Partial<ChannelPartner>) {
    return this.request("PUT", `/channelPartners/${uid}`, { channelPartner: partner });
  }

  async deleteChannelPartner(uid: string) {
    return this.request("DELETE", `/channelPartners/${uid}`);
  }

  async associateEntitlementToPartner(entitlementUid: string, partnerUid: string) {
    return this.request(
      "POST",
      `/entitlements/${entitlementUid}/channelPartners`,
      { channelPartner: { id: partnerUid } }
    );
  }

  async removeEntitlementFromPartner(entitlementUid: string, partnerUid: string) {
    return this.request(
      "DELETE",
      `/entitlements/${entitlementUid}/channelPartners/${partnerUid}`
    );
  }

  async listEntitlementPartners(entitlementUid: string) {
    return this.request("GET", `/entitlements/${entitlementUid}/channelPartners`);
  }

  // ─── Usage / Analytics ───────────────────────────────────────────────────────

  async getUsageSummary(params?: {
    customer_uid?: string;
    product_uid?: string;
    from?: string;
    to?: string;
  }) {
    return this.request("GET", "/usage/summary", undefined, {
      ...(params?.customer_uid && { customerUid: params.customer_uid }),
      ...(params?.product_uid && { productUid: params.product_uid }),
      ...(params?.from && { from: params.from }),
      ...(params?.to && { to: params.to }),
    });
  }

  async getUsageDetails(params?: {
    customer_uid?: string;
    feature_uid?: string;
    from?: string;
    to?: string;
  }) {
    return this.request("GET", "/usage/details", undefined, {
      ...(params?.customer_uid && { customerUid: params.customer_uid }),
      ...(params?.feature_uid && { featureUid: params.feature_uid }),
      ...(params?.from && { from: params.from }),
      ...(params?.to && { to: params.to }),
    });
  }

  // ─── License Models ──────────────────────────────────────────────────────────

  async listEnforcements() {
    return this.request("GET", "/enforcements");
  }

  async listLicenseModels(enforcementId?: string) {
    // Correct endpoint per EMS API docs: GET /enforcements/{enforcementId}/licenseModels
    // If enforcementId is supplied, query that enforcement directly.
    // If not supplied, auto-discover all enforcements and aggregate license models across them.
    if (enforcementId) {
      return this.request("GET", `/enforcements/${enforcementId}/licenseModels`);
    }

    // Auto-discover enforcements and collect all license models
    const enfRes = await this.listEnforcements();
    if (!enfRes.ok || !enfRes.data) {
      return { data: { licenseModels: { licenseModel: [] } }, status: enfRes.status, ok: false, error: `Failed to list enforcements: ${enfRes.error}` };
    }
    const enforcements: any[] = (enfRes.data as any)?.enforcements?.enforcement ?? [];
    const allModels: any[] = [];

    for (const enf of enforcements) {
      const lmRes = await this.request("GET", `/enforcements/${enf.id}/licenseModels`);
      if (lmRes.ok && lmRes.data) {
        const models = (lmRes.data as any)?.licenseModels?.licenseModel ?? [];
        // Tag each model with its enforcement for downstream use
        models.forEach((m: any) => { m._enforcement = enf; });
        allModels.push(...models);
      }
    }

    return {
      data: { licenseModels: { licenseModel: allModels } },
      status: 200,
      ok: true,
    };
  }

  async getLicenseModel(enforcementId: string, uid: string) {
    // Correct endpoint: GET /enforcements/{enforcementId}/licenseModels/{licenseModelId}
    return this.request("GET", `/enforcements/${enforcementId}/licenseModels/${uid}`);
  }

  // ─── Webhooks ────────────────────────────────────────────────────────────────

  async listWebhooks(params?: PaginationParams & { name?: string }) {
    return this.request("GET", "/webhooks", undefined, {
      pageSize: params?.limit ?? 50,
      ...(params?.offset !== undefined && { offset: params.offset }),
      ...(params?.name && { name: params.name }),
    });
  }

  async getWebhook(uid: string) {
    return this.request("GET", `/webhooks/${uid}`);
  }

  async createWebhook(webhook: Webhook) {
    const body: Record<string, unknown> = {
      name: webhook.name,
      url: webhook.url,
    };
    if (webhook.description) body.description = webhook.description;
    if (webhook.state) body.state = webhook.state;
    if (webhook.includeData !== undefined) body.includeData = webhook.includeData ? "YES" : "NO";
    if (webhook.events && webhook.events.length > 0) {
      body.events = { event: webhook.events.map((e) => ({ name: e })) };
    }
    if (webhook.authProfileUid) body.authProfile = { id: webhook.authProfileUid };
    return this.request("POST", "/webhooks", { webhook: body });
  }

  async updateWebhook(uid: string, webhook: Partial<Webhook>) {
    const body: Record<string, unknown> = {};
    if (webhook.name) body.name = webhook.name;
    if (webhook.url) body.url = webhook.url;
    if (webhook.description !== undefined) body.description = webhook.description;
    if (webhook.state) body.state = webhook.state;
    if (webhook.includeData !== undefined) body.includeData = webhook.includeData ? "YES" : "NO";
    if (webhook.events && webhook.events.length > 0) {
      body.events = { event: webhook.events.map((e) => ({ name: e })) };
    }
    if (webhook.authProfileUid) body.authProfile = { id: webhook.authProfileUid };
    return this.request("PUT", `/webhooks/${uid}`, { webhook: body });
  }

  async deleteWebhook(uid: string) {
    return this.request("DELETE", `/webhooks/${uid}`);
  }

  async searchWebhookEvents(params?: WebhookEventSearchParams) {
    return this.request("GET", "/webhooks/events", undefined, {
      pageSize: params?.limit ?? 50,
      ...(params?.offset !== undefined && { offset: params.offset }),
      ...(params?.webhook_uid && { webhookId: params.webhook_uid }),
      ...(params?.event_id && { eventId: params.event_id }),
      ...(params?.state && { state: params.state }),
      ...(params?.from && { from: params.from }),
      ...(params?.to && { to: params.to }),
    });
  }

  async retryWebhookEvents(event_ids?: string[]) {
    // Reprocess all failed events, or selectively by event ID array
    const body: Record<string, unknown> = {};
    if (event_ids && event_ids.length > 0) {
      body.events = { event: event_ids.map((id) => ({ id })) };
    }
    return this.request("POST", "/webhooks/events/retry", body);
  }

  // ─── Utility ─────────────────────────────────────────────────────────────────

  async ping() {
    return this.request("GET", "/entitlements", undefined, { pageSize: 1 });
  }
}