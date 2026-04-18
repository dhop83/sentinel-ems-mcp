# Sentinel EMS MCP Server

A cloud-hosted [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server that exposes the full [Thales Sentinel EMS](https://docs.sentinel.thalesgroup.com/) API as tools for Claude.ai and other MCP-compatible AI clients.

Once deployed, anyone can connect to it directly from **claude.ai → Settings → Integrations** — no local install required.

---

## 🚀 One-Click Deploy to Railway

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new/template?template=https://github.com/YOUR_USERNAME/sentinel-ems-mcp)

> **After clicking deploy**, Railway will ask you to set environment variables (see below).

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SENTINEL_EMS_URL` | ✅ | Your EMS instance URL, e.g. `https://xyz.trial.sentinelcloud.com` |
| `SENTINEL_EMS_USERNAME` | ✅ | EMS admin username |
| `SENTINEL_EMS_PASSWORD` | ✅ | EMS admin password |
| `SENTINEL_EMS_NAMESPACE_ID` | ❌ | Default namespace UID (optional) |
| `MCP_API_KEY` | ✅ recommended | Secret key users must pass to connect. Leave blank for open access. |
| `PORT` | ❌ | HTTP port — Railway sets this automatically |

---

## Connecting to Claude.ai

Once deployed, Railway gives you a URL like `https://your-app.up.railway.app`.

### Steps for each user:

1. Go to **[claude.ai](https://claude.ai) → Settings → Integrations**
2. Click **Add custom connector**
3. Fill in:
   - **Name:** `Sentinel EMS`
   - **Remote MCP server URL:** `https://your-app.up.railway.app/mcp`
4. If API key protection is enabled, expand **Advanced settings** and add:
   - Header name: `x-api-key`
   - Header value: *(the key you set as `MCP_API_KEY`)*
5. Click **Add** — done ✅

---

## Running Locally

```bash
# Install dependencies
npm install

# Copy and fill in env vars
cp .env.example .env

# Run in dev mode
npm run dev

# Or build and run
npm run build && npm start
```

---

## Available Tools

This server exposes 69 tools covering the full Sentinel EMS API:

- **Customers** — list, get, create, update, delete
- **Contacts** — list, get, create, update
- **Products** — list, get, create, update, delete, deploy
- **Features** — list, get, create, update, delete, license model association
- **Entitlements** — list, get, create, update, enable, split, delete, batch create
- **Activations** — activate, list, get, deactivate, renew, search expiring
- **Activatees** — list, add, remove
- **Channel Partners** — list, get, create, update, delete, associate with entitlements
- **Namespaces** — list, get, create, update, patch
- **License Models** — list, get
- **Webhooks** — list, get, create, update, delete, search events, retry
- **Usage** — summary, details
- **System** — ping

---

## Security

- All EMS credentials are stored as environment variables on the server — never exposed to users
- API key (`x-api-key` header) controls who can connect
- HTTPS is provided automatically by Railway
- The `/health` endpoint is public (no auth) for uptime monitoring
