# Multi-tenant usage guide

This backend enforces tenant context after authentication. Use the `X-Tenant-Id` header on tenant-protected routes. Swagger is available at `/api` with both Bearer auth and `X-Tenant-Id` documented.

- Auth routes `/auth/register` and `/auth/login` are public (no headers required).
- `/auth/me` requires Bearer token but skips tenant guard (no `X-Tenant-Id` needed).
- All other protected routes require both Bearer token and `X-Tenant-Id`.

## Quick start

1) Register (creates user + tenant + admin membership) and get `{ accessToken, tenantId }`:

```bash
curl -s -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "alice@example.com",
    "password": "P@ssw0rd!",
    "organizationName": "Alice SARL"
  }'
```

Response:
```json
{ "accessToken": "<JWT>", "tenantId": "<TENANT_ID>" }
```

2) Login (if already registered) and get `{ accessToken }`:
```bash
curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "alice@example.com",
    "password": "P@ssw0rd!"
  }'
```

3) Get current user and memberships (no X-Tenant-Id required here):
```bash
curl -s http://localhost:3000/auth/me \
  -H "Authorization: Bearer <ACCESS_TOKEN>"
```

4) Call tenant-protected routes (example placeholder):
```bash
curl -s http://localhost:3000/items \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "X-Tenant-Id: <TENANT_ID>"
```

## Swagger tips
- Open http://localhost:3000/api
- Click "Authorize" and paste your Bearer token
- For routes that need tenant context, set the `X-Tenant-Id` header in the UI

## Environment
Ensure `.env` contains:
```
PORT=3000
MONGO_URI=mongodb://localhost:27017/sfe
JWT_SECRET=change-me
# optional for dev CORS allowlist
CORS_ORIGINS=http://localhost:3000,http://localhost:5173
```
