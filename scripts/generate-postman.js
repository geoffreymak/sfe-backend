// scripts/generate-postman.js
const fs = require('fs');
const path = require('path');
const converter = require('openapi-to-postmanv2');
const { Collection, ItemGroup, Item, Event, Script, Url, Header, Variable } = require('postman-collection');

const OPENAPI = path.resolve('openapi.json');
const OUT_COLL = path.resolve('SFE_backend_full_api.postman_collection.json');
const OUT_ENV  = path.resolve('SFE_backend_full_api.environment.json');

if (!fs.existsSync(OPENAPI)) {
  console.error('openapi.json introuvable. Lance d’abord: npm run postman:openapi');
  process.exit(1);
}

const openapi = JSON.parse(fs.readFileSync(OPENAPI, 'utf-8'));

// Variables d’environnement (modifiables ensuite dans Postman)
const ENV_VARS = [
  { key: 'baseUrl',     value: process.env.POSTMAN_BASE_URL || 'http://localhost:3000' },
  { key: 'email',       value: process.env.POSTMAN_EMAIL    || 'user@example.com' },
  { key: 'password',    value: process.env.POSTMAN_PASSWORD || 'Password123!' },
  { key: 'token',       value: '' },
  { key: 'tenantId',    value: '' },
  { key: 'userId',      value: '' },
  { key: 'clientId',    value: '' },
  { key: 'itemId',      value: '' },
  { key: 'warehouseId', value: '' },
  { key: 'invoiceId',   value: '' },
  { key: 'roleId',      value: '' },
  { key: 'fxValidFrom', value: '2025-08-01T12:00:00Z' },
  { key: 'otherUserId', value: '' },
  { key: 'email_new_user', value: 'new.user@example.com' },
  { key: 'tempPassword', value: 'TempPassword123!' }
];

// Détecte si une opération nécessite auth (piloté par openapi.security + operation.security)
function opNeedsAuth(pathKey, method) {
  const op = (openapi.paths?.[pathKey] || {})[method];
  const topSec = openapi.security || [];
  const opSec = op?.security ?? topSec; // si operation.security non défini, utiliser le top-level
  if (!opSec || !opSec.length) return false;
  // S’il y a un schéma bearer dans la sécurité
  return opSec.some(sec => Object.keys(sec).some(k => /bearer/i.test(k)));
}

// Détecte si une opération exige un header X-Tenant-Id (via paramètres OpenAPI)
function opNeedsTenantHeader(pathKey, method) {
  const op = (openapi.paths?.[pathKey] || {})[method];
  const params = [...(openapi.paths?.[pathKey]?.parameters || []), ...(op?.parameters || [])];
  const declaredAsHeaderParam = params.some(p => p.in === 'header' && /^x-tenant-id$/i.test(p.name));
  if (declaredAsHeaderParam) return true;

  // Otherwise infer from security: look for an apiKey header scheme named X-Tenant-Id
  const topSec = openapi.security || [];
  const opSec = op?.security ?? topSec;
  if (!opSec || !opSec.length) return false;

  const schemes = openapi.components?.securitySchemes || {};
  const hasTenantSec = opSec.some(sec =>
    Object.keys(sec).some(k => {
      const scheme = schemes[k];
      return scheme && scheme.type === 'apiKey' && /^x-tenant-id$/i.test(scheme.name) && scheme.in === 'header';
    })
  );
  return hasTenantSec;
}

// Détecte si opération accepte X-Request-Id (si déclaré en header dans OpenAPI)
function opSupportsRequestId(pathKey, method) {
  const op = (openapi.paths?.[pathKey] || {})[method];
  const params = [...(openapi.paths?.[pathKey]?.parameters || []), ...(op?.parameters || [])];
  return params.some(p => p.in === 'header' && /^x-request-id$/i.test(p.name));
}

// Cherche un item dans la collection par méthode et chemin OpenAPI (ex: /auth/register, post)
function findItemByPathAndMethod(coll, rawPath, method) {
  let res = null;
  coll.items.each((it) => {
    it.forEachItem((leaf) => {
      const req = leaf.request;
      if (!req) return;
      const m = String(req.method || '').toLowerCase();
      const url = req.url && req.url.getPathWithQuery && req.url.getPathWithQuery() || '';
      // Compare en ignorant host : on cherche la fin (…/v1/auth/login?...)
      if (m === method && url.endsWith(rawPath)) res = leaf;
    });
  });
  return res;
}

// Convertit OpenAPI -> Postman
converter.convert({ type: 'json', data: JSON.stringify(openapi) }, {
  folderStrategy: 'Tags',
  requestParametersResolution: 'Example',
  exampleParametersResolution: 'Example'
}, (err, conv) => {
  if (err || !conv?.result) {
    console.error('Erreur conversion OpenAPI -> Postman:', err || conv);
    process.exit(1);
  }

  const raw = conv.output[0].data;
  const coll = new Collection(raw);

  // 1) Nettoyage des variables de collection (on utilise l'environnement Postman à la place)
  coll.variables.clear();

  const normalizeUrl = (req) => {
    if (!req?.url) return;
    const u = req.url;
    let pathWithQuery = '';
    if (typeof u.getPathWithQuery === 'function') {
      pathWithQuery = u.getPathWithQuery();
    } else {
      // Fallback: reconstruct from path/query arrays if present
      const pArr = Array.isArray(u.path) ? u.path : [];
      const pathStr = pArr.length ? ('/' + pArr.join('/')) : '';
      let qStr = '';
      const qArr = Array.isArray(u.query) ? u.query : [];
      if (qArr.length) {
        const kv = qArr.map(q =>
          (q && q.key != null)
            ? encodeURIComponent(String(q.key)) + (q.value != null ? '=' + encodeURIComponent(String(q.value)) : '')
            : ''
        ).filter(Boolean).join('&');
        qStr = kv ? ('?' + kv) : '';
      }
      pathWithQuery = pathStr + qStr;
    }
    // Build a Url with explicit raw and path/query arrays (no host) to satisfy Postman schema
    let pathArr = [];
    if (u && Array.isArray(u.path)) pathArr = u.path;
    else if (u && typeof u.getPath === 'function') {
      const p = u.getPath();
      if (Array.isArray(p)) pathArr = p;
      else if (typeof p === 'string' && p) pathArr = p.replace(/^\//, '').split('/');
    }
    let queryArr = [];
    if (u && u.query) {
      if (typeof u.query.all === 'function') queryArr = u.query.all();
      else if (Array.isArray(u.query)) queryArr = u.query;
    }
    req.url = new Url({ raw: '{{baseUrl}}' + pathWithQuery, path: pathArr, query: queryArr });
  };

  coll.items.each(item => {
    if (typeof item.forEachItem === 'function') {
      item.forEachItem((leaf) => {
        normalizeUrl(leaf.request);
      });
    } else {
      normalizeUrl(item.request);
    }
  });

  // Normalize url.raw for responses' originalRequest as well, to satisfy Postman importer
  coll.items.each(item => {
    const processLeaf = (leaf) => {
      const resps = leaf && leaf.responses;
      if (resps && typeof resps.each === 'function') {
        resps.each((resp) => {
          if (resp && resp.originalRequest) {
            try { normalizeUrl(resp.originalRequest); } catch (_) { /* ignore */ }
          }
        });
      }
    };
    if (typeof item.forEachItem === 'function') item.forEachItem(processLeaf);
    else processLeaf(item);
  });

  // 2) Injection de headers basés UNIQUEMENT sur OpenAPI (auth / tenant / request-id)
  coll.items.each((it) => {
    const processLeaf = (leaf) => {
      const req = leaf.request;
      if (!req) return;

      const m = String(req.method || '').toLowerCase();
      const pathWithQuery = req.url && req.url.getPathWithQuery ? req.url.getPathWithQuery() : '';
      // Retrouver la clé de chemin OpenAPI (sans le host)
      const pathKey = Object.keys(openapi.paths || {}).find(k => pathWithQuery.endsWith(k));
      if (!pathKey) return;

      // Supprime tout auth Postman au niveau requête (on préfère les headers explicites)
      if (req && req.auth) {
        try { delete req.auth; } catch (_) {}
      }
      // Nettoyage des headers potentiellement injectés par le converter (évite doublons)
      try {
        const existing = (req.headers && typeof req.headers.all === 'function') ? req.headers.all() : [];
        existing.forEach(h => {
          const k = String(h.key || '');
          if (/^authorization$/i.test(k) || /^x-tenant-id$/i.test(k) || /^x-request-id$/i.test(k) || /^content-type$/i.test(k)) {
            try { req.headers.remove(h.key); } catch (_) {}
          }
        });
      } catch (_) {}
      // Auth (Bearer) si requis par OpenAPI
      if (opNeedsAuth(pathKey, m)) {
        req.addHeader(new Header({ key: 'Authorization', value: 'Bearer {{token}}' }));
      }
      // X-Tenant-Id si déclaré dans OpenAPI
      if (opNeedsTenantHeader(pathKey, m)) {
        req.addHeader(new Header({ key: 'X-Tenant-Id', value: '{{tenantId}}' }));
      }
      // X-Request-Id sur toutes les requêtes
      req.addHeader(new Header({ key: 'X-Request-Id', value: '{{$guid}}' }));
      // Content-Type si body json
      if (req.body && req.body.mode === 'raw') {
        req.addHeader(new Header({ key: 'Content-Type', value: 'application/json' }));
      }
      // Nettoyages supplémentaires non nécessaires ici: handled by sanitizeHeaders post-serialization
    };
    if (typeof it.forEachItem === 'function') {
      it.forEachItem(processLeaf);
    } else {
      processLeaf(it);
    }
  });

  // 3) Injection de payloads JSON exemples (basés sur nos DTOs)
  const ensureContentType = (req) => {
    const hasCT = (req.headers.all() || []).some(h => /^content-type$/i.test(h.key));
    if (!hasCT) req.addHeader(new Header({ key: 'Content-Type', value: 'application/json' }));
  };

  const setBody = (leaf, bodyObj) => {
    if (!leaf?.request) return;
    const req = leaf.request;
    req.body = {
      mode: 'raw',
      raw: JSON.stringify(bodyObj, null, 2),
    };
    ensureContentType(req);
  };

  const payloadFor = (pathKey, method) => {
    // method: lower-case
    switch (`${method} ${pathKey}`) {
      case 'post /auth/register':
        return { email: '{{email}}', password: '{{password}}', organizationName: 'ACME SARL' };
      case 'post /auth/login':
        return { email: '{{email}}', password: '{{password}}' };

      case 'put /settings':
        return {
          currency: {
            base: 'CDF',
            defaultAlt: 'USD',
            allowed: ['USD'],
            decimals: 2,
            rounding: 'HALF_UP',
          },
          invoice: {
            defaultModePrix: 'TTC',
            numbering: { prefix: 'FV', yearlyReset: true, width: 6 },
            idempotencyTTLHours: 24,
          },
          loyalty: {
            enabled: false,
            earn: { base: 'TTC', rate: 1, baseUnit: 1000, excludeTaxGroups: ['L', 'N'] },
            redeem: { pointValueCDF: 10 },
          },
          stock: {
            costingMethod: 'AVG',
            allowNegativeStock: false,
            reservationsEnabled: false,
          },
          integration: {
            mode: 'mock',
            safety: { subtotalCheck: true, confirmDeadlineSec: 120, pendingMax: 10 },
            // Optionnel: emcf/mcf configs
            // emcf: { baseUrlInfo: 'https://emcf/info', baseUrlInvoice: 'https://emcf/invoice', token: 'token', isf: 'ISF-123', nif: 'NIF-001' },
            // mcf: { port: 1, baud: 115200, dataBits: 8, parity: 'none', stopBits: 1, isf: 'ISF-123', nif: 'NIF-001' },
          },
        };

      case 'post /currencies':
        return { code: 'EUR', name: 'Euro', symbol: '€', enabled: false };
      case 'post /fx-rates':
        return { base: 'CDF', quote: 'USD', rate: '2750.50', validFrom: '{{fxValidFrom}}' };
      case 'post /items':
        return {
          code: 'SKU-001',
          name: 'Stylo bille bleu',
          type: 'BIE',
          unit: 'pcs',
          barcode: '1234567890123',
          taxGroupDefault: 'B',
          priceTTC: '1160.00',
          stockTracking: 'none',
        };
      case 'post /clients':
        return {
          type: 'PM',
          denomination: 'ACME SARL',
          nif: 'A1234567C',
          email: 'client@example.com',
          phone: '+243811234567',
        };
      case 'post /warehouses':
        return { code: 'WH-001', name: 'Entrepôt principal', address: 'Av. 30 Juin, Kinshasa' };

      case 'post /stock/receipts':
        return {
          warehouseId: '{{warehouseId}}',
          lines: [
            { itemId: '{{itemId}}', qty: '10.0', unitCost: '100.00' },
          ],
        };
      case 'post /stock/transfers':
        return {
          fromWarehouseId: '{{warehouseId}}',
          toWarehouseId: '{{warehouseId}}',
          lines: [
            { itemId: '{{itemId}}', qty: '5.0' },
          ],
        };
      case 'post /stock/adjustments':
        return {
          warehouseId: '{{warehouseId}}',
          lines: [
            { itemId: '{{itemId}}', qtyDelta: '-2.0', reason: 'stock count correction' },
          ],
        };

      case 'post /invoices/draft':
        return {
          modePrix: 'TTC',
          type: 'FV',
          client: { type: 'PM', denomination: 'ACME SARL', nif: 'A1234567C' },
          lines: [
            { kind: 'BIE', group: 'B', label: 'Stylo bille bleu', qty: '1.000', unitPrice: '1160.00' },
            { kind: 'TAX', group: 'L', label: 'Taxe parafiscale', qty: '1.000', unitPrice: '100.00' },
          ],
        };
      case 'post /invoices/{id}/confirm':
        return { equivalentCurrency: { code: 'USD' } };
      
      // Invoices orchestrator
      case 'post /invoices/{id}/normalize':
        return null; // no body, optional X-Idempotency-Key header handled manually in Postman if needed

      // RBAC
      case 'post /rbac/roles':
        return {
          key: 'MANAGER',
          name: 'manager',
          description: 'Can manage core resources',
          permissions: ['items:read', 'invoices:create']
        };
      case 'patch /rbac/roles/{id}':
        return {
          name: 'manager+',
          description: 'Extended manager permissions',
          permissions: ['items:read', 'items:write', 'invoices:create']
        };
      case 'put /rbac/users/{userId}/memberships/{tenantId}/roles':
        return { roles: ['ADMIN', 'MANAGER'] };

      // Profile
      case 'put /me/profile':
        return {
          displayName: 'John Doe',
          phone: '+243820000000',
          avatarUrl: 'https://example.com/avatar-john.png',
          locale: 'fr-CD',
          timezone: 'Africa/Kinshasa'
        };
      case 'patch /me/password':
        return {
          currentPassword: '{{password}}',
          newPassword: '{{tempPassword}}'
        };

      // Loyalty
      case 'post /loyalty/enroll':
        return { clientId: '{{clientId}}', cardId: 'CARD-0001' };
      case 'post /loyalty/redeem':
        return {
          clientId: '{{clientId}}',
          points: 100,
          reason: 'Reward redemption',
          idempotencyKey: 'redeem-{{$timestamp}}'
        };

      // Integrations
      case 'get /integrations/status':
        return null; // no body

      // Users (Admin)
      case 'post /users':
        return {
          email: '{{email_new_user}}',
          displayName: 'Jane Admin',
          phone: '+243810000000',
          avatarUrl: 'https://example.com/avatar.png',
          locale: 'fr-CD',
          timezone: 'Africa/Kinshasa',
          password: '{{tempPassword}}',
          defaultTenantId: '{{tenantId}}',
          roles: ['ADMIN', 'USERS:READ', 'USERS:WRITE']
        };
      case 'patch /users/{id}':
        return {
          displayName: 'Jane A.',
          phone: '+243811111111',
          avatarUrl: 'https://example.com/avatars/jane.png',
          locale: 'fr',
          timezone: 'Africa/Kinshasa'
        };
      case 'put /users/{id}/status':
        return { status: 'active' };
      case 'put /users/{id}/roles':
        return { roles: ['ADMIN', 'USERS:READ', 'USERS:WRITE'] };
      case 'put /users/{id}/default-tenant':
        return { tenantId: '{{tenantId}}' };
      default:
        return null;
    }
  };

  coll.items.each((it) => {
    const processLeaf = (leaf) => {
      const req = leaf.request;
      if (!req) return;
      const m = String(req.method || '').toLowerCase();
      const pathWithQuery = req.url && req.url.getPathWithQuery ? req.url.getPathWithQuery() : '';
      const pathKey = Object.keys(openapi.paths || {}).find(k => pathWithQuery.endsWith(k));
      if (!pathKey) return;
      const payload = payloadFor(pathKey, m);
      if (payload) setBody(leaf, payload);
    };
    if (typeof it.forEachItem === 'function') {
      it.forEachItem(processLeaf);
    } else {
      processLeaf(it);
    }
  });

  // 4) Tests automatiques pour /auth (uniquement si présents dans OpenAPI)
  const addAuthTest = (leaf, lines) => {
    leaf.events.add(new Event({ listen: 'test', script: new Script({ exec: lines }) }));
  };

  const authRegister = findItemByPathAndMethod(coll, '/auth/register', 'post');
  if (authRegister) {
    addAuthTest(authRegister, [
      "pm.test('201', ()=>pm.expect([200,201]).to.include(pm.response.code));",
      "const d = pm.response.json();",
      "if (d?.accessToken) pm.collectionVariables.set('token', d.accessToken);",
      "if (d?.tenantId) pm.collectionVariables.set('tenantId', d.tenantId);",
      "if (d?.userId) pm.collectionVariables.set('userId', d.userId);",
    ]);
  }

  const authLogin = findItemByPathAndMethod(coll, '/auth/login', 'post');
  if (authLogin) {
    addAuthTest(authLogin, [
      "pm.test('200', ()=>pm.response.to.have.status(200));",
      "const d = pm.response.json();",
      "if (d?.accessToken) pm.collectionVariables.set('token', d.accessToken);",
    ]);
  }

  // 5) Curated structure: regroupement et renommage conforme à l'exemple cible
  // Activer via POSTMAN_USE_CURATED=1. Par défaut, on respecte STRICTEMENT les tags Swagger
  const USE_CURATED = process.env.POSTMAN_USE_CURATED === '1';
  const curatedItems = [];
  if (USE_CURATED) {
  const usedOps = new Set();
  const makeReqDescription = (pathKey, method) => {
    try {
      const op = (openapi.paths?.[pathKey] || {})[String(method).toLowerCase()];
      if (!op) return `[${String(method).toUpperCase()}] ${pathKey}`;
      const parts = [];
      if (op.summary) parts.push(String(op.summary).trim());
      if (op.description) parts.push(String(op.description).trim());
      const needsAuth = opNeedsAuth(pathKey, String(method).toLowerCase());
      const needsTenant = opNeedsTenantHeader(pathKey, String(method).toLowerCase());
      const meta = [];
      meta.push('X-Request-Id header is always added');
      if (needsAuth) meta.push('Requires Authorization: Bearer {{token}}');
      if (needsTenant) meta.push('Requires X-Tenant-Id: {{tenantId}}');
      if (meta.length) parts.push('Notes: ' + meta.join(' | '));
      return parts.join('\n\n').trim();
    } catch (_) {
      return `[${String(method).toUpperCase()}] ${pathKey}`;
    }
  };
  const getJsonItem = (method, p) => {
    const src = findItemByPathAndMethod(coll, p, method);
    if (!src) return null;
    usedOps.add(`${String(method).toLowerCase()} ${p}`);
    const node = JSON.parse(JSON.stringify(src.toJSON()));
    if (node && node.request) {
      node.request.description = makeReqDescription(p, String(method).toLowerCase());
    }
    return node;
  };
  const ensureHeaderKV = (req, key, value) => {
    if (!req) return;
    if (!Array.isArray(req.header)) req.header = [];
    // remove existing case-insensitively then push
    req.header = req.header.filter(h => String(h.key || '').toLowerCase() !== String(key).toLowerCase());
    req.header.push({ key, value });
  };
  const setBodyRaw = (item, obj) => {
    if (!item || !item.request) return;
    item.request.body = { mode: 'raw', raw: JSON.stringify(obj, null, 2) };
    ensureHeaderKV(item.request, 'Content-Type', 'application/json');
  };
  const setUrlRaw = (item, rawUrl) => {
    if (!item || !item.request) return;
    item.request.url = typeof rawUrl === 'string' ? rawUrl : item.request.url;
  };
  const setQuery = (item, queryArr) => {
    if (!item || !item.request) return;
    if (!item.request.url || typeof item.request.url !== 'object') item.request.url = { raw: item.request.url || '' };
    item.request.url.query = queryArr;
  };
  
  // 00 — Setup (Auth & Me)
  {
    const g = { name: '00 — Setup (Auth & Me)', item: [] };
    const reg = getJsonItem('post', '/auth/register');
    if (reg) { reg.name = 'Register'; if (reg.request) reg.request.name = 'Register'; g.item.push(reg); }
    const login = getJsonItem('post', '/auth/login');
    if (login) { login.name = 'Login'; if (login.request) login.request.name = 'Login'; g.item.push(login); }
    const me = getJsonItem('get', '/me');
    if (me) {
      me.name = 'Me (JWT + Tenant)';
      if (me.request) {
        me.request.name = 'Me (JWT + Tenant)';
        ensureHeaderKV(me.request, 'Authorization', 'Bearer {{token}}');
        ensureHeaderKV(me.request, 'X-Tenant-Id', '{{tenantId}}');
        ensureHeaderKV(me.request, 'X-Request-Id', '{{$guid}}');
      }
      g.item.push(me);
    }
    curatedItems.push(g);
  }
  // 01 — Profile
  {
    const g = { name: '01 — Profile', item: [] };
    const p1 = getJsonItem('get', '/me/profile'); if (p1) { p1.name = 'GET /me/profile'; if (p1.request) { p1.request.name = p1.name; ensureHeaderKV(p1.request, 'Content-Type', 'application/json'); } g.item.push(p1); }
    const p2 = getJsonItem('put', '/me/profile'); if (p2) { p2.name = 'PUT /me/profile'; if (p2.request) p2.request.name = p2.name; g.item.push(p2); }
    const p3 = getJsonItem('patch', '/me/password'); if (p3) { p3.name = 'PATCH /me/password'; if (p3.request) p3.request.name = p3.name; g.item.push(p3); }
    const p4 = getJsonItem('get', '/me/roles'); if (p4) { p4.name = 'GET /me/roles'; if (p4.request) { p4.request.name = p4.name; ensureHeaderKV(p4.request, 'Content-Type', 'application/json'); } g.item.push(p4); }
    const p5 = getJsonItem('get', '/me/permissions'); if (p5) { p5.name = 'GET /me/permissions'; if (p5.request) { p5.request.name = p5.name; ensureHeaderKV(p5.request, 'Content-Type', 'application/json'); } g.item.push(p5); }
    curatedItems.push(g);
  }
  // 02 — RBAC (Store only)
  {
    const g = { name: '02 — RBAC (Store only)', item: [] };
    const r1 = getJsonItem('get', '/rbac/permissions/catalog'); if (r1) { r1.name = 'GET /rbac/permissions/catalog'; if (r1.request) { r1.request.name = r1.name; ensureHeaderKV(r1.request, 'Content-Type', 'application/json'); } g.item.push(r1); }
    const r2 = getJsonItem('get', '/rbac/roles'); if (r2) { r2.name = 'GET /rbac/roles'; if (r2.request) { r2.request.name = r2.name; ensureHeaderKV(r2.request, 'Content-Type', 'application/json'); } g.item.push(r2); }
    const r3 = getJsonItem('post', '/rbac/roles'); if (r3) { r3.name = 'POST /rbac/roles (create custom)'; if (r3.request) r3.request.name = r3.name; g.item.push(r3); }
    const r4 = getJsonItem('patch', '/rbac/roles/{id}'); if (r4) { r4.name = 'PATCH /rbac/roles/:id'; if (r4.request) { r4.request.name = r4.name; setUrlRaw(r4, '{{baseUrl}}/rbac/roles/{{roleId}}'); } g.item.push(r4); }
    const r5 = getJsonItem('get', '/rbac/users/{userId}/memberships/{tenantId}'); if (r5) { r5.name = 'GET /rbac/users/:userId/memberships/:tenantId'; if (r5.request) { r5.request.name = r5.name; setUrlRaw(r5, '{{baseUrl}}/rbac/users/{{userId}}/memberships/{{tenantId}}'); ensureHeaderKV(r5.request, 'Content-Type', 'application/json'); } g.item.push(r5); }
    const r6 = getJsonItem('put', '/rbac/users/{userId}/memberships/{tenantId}/roles'); if (r6) { r6.name = 'PUT /rbac/users/:userId/memberships/:tenantId/roles'; if (r6.request) { r6.request.name = r6.name; setUrlRaw(r6, '{{baseUrl}}/rbac/users/{{userId}}/memberships/{{tenantId}}/roles'); } g.item.push(r6); }
    const r7 = getJsonItem('delete', '/rbac/roles/{id}'); if (r7) { r7.name = 'DELETE /rbac/roles/:id'; if (r7.request) { r7.request.name = r7.name; setUrlRaw(r7, '{{baseUrl}}/rbac/roles/{{roleId}}'); } g.item.push(r7); }
    curatedItems.push(g);
  }
  // 03 — Settings
  {
    const g = { name: '03 — Settings', item: [] };
    const s1 = getJsonItem('get', '/settings'); if (s1) { s1.name = 'GET /settings'; if (s1.request) { s1.request.name = s1.name; ensureHeaderKV(s1.request, 'Content-Type', 'application/json'); } g.item.push(s1); }
    const s2 = getJsonItem('put', '/settings'); if (s2) { s2.name = 'PUT /settings'; if (s2.request) s2.request.name = s2.name; g.item.push(s2); }
    const s3 = getJsonItem('get', '/settings/public'); if (s3) { s3.name = 'GET /settings/public'; if (s3.request) { s3.request.name = s3.name; ensureHeaderKV(s3.request, 'Content-Type', 'application/json'); } g.item.push(s3); }
    const s4 = getJsonItem('get', '/settings/integration'); if (s4) { s4.name = 'GET /settings/integration'; if (s4.request) { s4.request.name = s4.name; ensureHeaderKV(s4.request, 'Content-Type', 'application/json'); } g.item.push(s4); }
    const s5a = getJsonItem('put', '/settings/integration');
    if (s5a) {
      s5a.name = 'PUT /settings/integration (e-MCF)'; if (s5a.request) s5a.request.name = s5a.name;
      setBodyRaw(s5a, {
        mode: 'emcf',
        emcf: { baseUrlInfo: 'http://emcf.local/api/info', baseUrlInvoice: 'http://emcf.local/api/invoice', token: 'TKN', isf: 'ISF', nif: 'NIF' },
        safety: { subtotalCheck: true, confirmDeadlineSec: 120, pendingMax: 10 }
      });
      g.item.push(s5a);
    }
    const s5b = getJsonItem('put', '/settings/integration');
    if (s5b) {
      s5b.name = 'PUT /settings/integration (MCF)'; if (s5b.request) s5b.request.name = s5b.name;
      setBodyRaw(s5b, {
        mode: 'mcf',
        mcf: { port: '/dev/ttyS0', baud: 115200, dataBits: 8, parity: 'none', stopBits: 1, isf: 'ISF', nif: 'NIF' },
        safety: { subtotalCheck: true, confirmDeadlineSec: 120, pendingMax: 10 }
      });
      g.item.push(s5b);
    }
    curatedItems.push(g);
  }
  // 04 — Currencies & FX
  {
    const g = { name: '04 — Currencies & FX', item: [] };
    const c1 = getJsonItem('get', '/currencies'); if (c1) { c1.name = 'GET /currencies'; if (c1.request) { c1.request.name = c1.name; ensureHeaderKV(c1.request, 'Content-Type', 'application/json'); } g.item.push(c1); }
    const c2 = getJsonItem('post', '/currencies'); if (c2) { c2.name = 'POST /currencies (EUR)'; if (c2.request) c2.request.name = c2.name; setBodyRaw(c2, { code: 'EUR', name: 'Euro', enabled: true }); g.item.push(c2); }
    const c3 = getJsonItem('patch', '/currencies/{code}'); if (c3) { c3.name = 'PATCH /currencies/CDF (should 400)'; if (c3.request) { c3.request.name = c3.name; setUrlRaw(c3, '{{baseUrl}}/currencies/CDF'); setBodyRaw(c3, { isBase: false }); } g.item.push(c3); }
    const c4 = getJsonItem('delete', '/currencies/{code}'); if (c4) { c4.name = 'DELETE /currencies/USD (should 400)'; if (c4.request) { c4.request.name = c4.name; setUrlRaw(c4, '{{baseUrl}}/currencies/USD'); } g.item.push(c4); }
    const fx1 = getJsonItem('post', '/fx-rates'); if (fx1) { fx1.name = 'POST /fx-rates (USD manual)'; if (fx1.request) { fx1.request.name = fx1.name; setBodyRaw(fx1, { quote: 'USD', rate: '0.00035', validFrom: '{{fxValidFrom}}' }); } g.item.push(fx1); }
    const fx2 = getJsonItem('get', '/fx-rates/latest'); if (fx2) { fx2.name = 'GET /fx-rates/latest?quote=USD'; if (fx2.request) { fx2.request.name = fx2.name; setUrlRaw(fx2, '{{baseUrl}}/fx-rates/latest?quote=USD'); setQuery(fx2, [{ key: 'quote', value: 'USD' }]); ensureHeaderKV(fx2.request, 'Content-Type', 'application/json'); } g.item.push(fx2); }
    curatedItems.push(g);
  }
  // 05 — Clients & Loyalty
  {
    const g = { name: '05 — Clients & Loyalty', item: [] };
    const cl1 = getJsonItem('get', '/clients'); if (cl1) { cl1.name = 'GET /clients'; if (cl1.request) { cl1.request.name = cl1.name; ensureHeaderKV(cl1.request, 'Content-Type', 'application/json'); } g.item.push(cl1); }
    const cl2 = getJsonItem('post', '/clients'); if (cl2) { cl2.name = 'POST /clients (PP)'; if (cl2.request) cl2.request.name = cl2.name; setBodyRaw(cl2, { type: 'PP', displayName: 'Client Comptoir' }); g.item.push(cl2); }
    const cl3 = getJsonItem('post', '/clients'); if (cl3) { cl3.name = 'POST /clients (AO)'; if (cl3.request) cl3.request.name = cl3.name; setBodyRaw(cl3, { type: 'AO', name: 'Administration', refExo: 'EXO-1' }); g.item.push(cl3); }
    const lo1 = getJsonItem('post', '/loyalty/enroll'); if (lo1) { lo1.name = 'POST /loyalty/enroll'; if (lo1.request) lo1.request.name = lo1.name; g.item.push(lo1); }
    const lo2 = getJsonItem('post', '/loyalty/redeem'); if (lo2) { lo2.name = 'POST /loyalty/redeem (idempotent)'; if (lo2.request) { lo2.request.name = lo2.name; ensureHeaderKV(lo2.request, 'X-Idempotency-Key', '{{$guid}}'); } g.item.push(lo2); }
    const lo3 = getJsonItem('get', '/loyalty/transactions'); if (lo3) { lo3.name = 'GET /loyalty/transactions?clientId={{clientId}}'; if (lo3.request) { lo3.request.name = lo3.name; setUrlRaw(lo3, '{{baseUrl}}/loyalty/transactions?clientId={{clientId}}'); setQuery(lo3, [{ key: 'clientId', value: '{{clientId}}' }]); ensureHeaderKV(lo3.request, 'Content-Type', 'application/json'); } g.item.push(lo3); }
    curatedItems.push(g);
  }
  // 06 — Items
  {
    const g = { name: '06 — Items', item: [] };
    const it1 = getJsonItem('get', '/items'); if (it1) { it1.name = 'GET /items'; if (it1.request) { it1.request.name = it1.name; ensureHeaderKV(it1.request, 'Content-Type', 'application/json'); } g.item.push(it1); }
    const it2 = getJsonItem('post', '/items'); if (it2) { it2.name = 'POST /items (BIE/B)'; if (it2.request) it2.request.name = it2.name; setBodyRaw(it2, { code: 'BIE-1', name: 'Article B', type: 'BIE', unit: 'pc', priceHT: '10000', taxGroupDefault: 'B', stockTracking: 'simple' }); g.item.push(it2); }
    const it3 = getJsonItem('post', '/items'); if (it3) { it3.name = 'POST /items (TAX on B should 400)'; if (it3.request) it3.request.name = it3.name; setBodyRaw(it3, { code: 'TAX-B', name: 'Taxe B', type: 'TAX', unit: 'u', priceHT: '1', taxGroupDefault: 'B' }); g.item.push(it3); }
    const it4 = getJsonItem('post', '/items'); if (it4) { it4.name = 'POST /items (TAX on L ok)'; if (it4.request) it4.request.name = it4.name; setBodyRaw(it4, { code: 'TAX-L', name: 'Taxe L', type: 'TAX', unit: 'u', priceHT: '1', taxGroupDefault: 'L' }); g.item.push(it4); }
    curatedItems.push(g);
  }
  // 07 — Stock avancé
  {
    const g = { name: '07 — Stock avancé', item: [] };
    const w1 = getJsonItem('post', '/warehouses'); if (w1) { w1.name = 'POST /warehouses'; if (w1.request) w1.request.name = w1.name; setBodyRaw(w1, { code: 'WH-1', name: 'Dépôt Principal' }); g.item.push(w1); }
    const w2 = getJsonItem('get', '/warehouses'); if (w2) { w2.name = 'GET /warehouses'; if (w2.request) { w2.request.name = w2.name; ensureHeaderKV(w2.request, 'Content-Type', 'application/json'); } g.item.push(w2); }
    const sr = getJsonItem('post', '/stock/receipts'); if (sr) { sr.name = 'POST /stock/receipts'; if (sr.request) sr.request.name = sr.name; g.item.push(sr); }
    const st = getJsonItem('post', '/stock/transfers'); if (st) { st.name = 'POST /stock/transfers'; if (st.request) st.request.name = st.name; g.item.push(st); }
    const sa = getJsonItem('post', '/stock/adjustments'); if (sa) { sa.name = 'POST /stock/adjustments'; if (sa.request) sa.request.name = sa.name; g.item.push(sa); }
    curatedItems.push(g);
  }

  // 08 — Other Endpoints (auto-included from OpenAPI, not already curated)
  {
    const other = { name: '08 — Other Endpoints (from OpenAPI)', description: 'Endpoints auto-inclus depuis OpenAPI et non couverts par les groupes ci-dessus.', item: [] };
    const METHODS = ['get','post','put','patch','delete','options','head'];
    Object.entries(openapi.paths || {}).forEach(([pathKey, obj]) => {
      METHODS.forEach((m) => {
        if (obj && Object.prototype.hasOwnProperty.call(obj, m)) {
          const key = `${m} ${pathKey}`;
          if (!usedOps.has(key)) {
            const it = getJsonItem(m, pathKey);
            if (it) {
              if (!it.name) it.name = `${m.toUpperCase()} ${pathKey}`;
              if (it.request) it.request.name = it.name;
              other.item.push(it);
            }
          }
        }
      });
    });
    if (other.item.length) curatedItems.push(other);
  }

  // 6) Runners — uniquement si mode CURATED
  const mkRunner = (name) => new ItemGroup({ name, description: 'Construit à partir des endpoints détectés dans la collection issue d’OpenAPI.' });
  const e2e = mkRunner('11 — E2E Runner (Business)');
  const users = mkRunner('12 — Users Admin Runner');

  // Helper: cloner une requête existante (si OpenAPI la définit)
  const cloneIfExists = (runner, method, p) => {
    const src = findItemByPathAndMethod(coll, p, method);
    if (src) {
      // Cloner pour le runner
      runner.items.add(new Item(JSON.parse(JSON.stringify(src.toJSON()))));
    }
  };

  // E2E Business : on ne clone QUE si les endpoints existent dans OpenAPI
  cloneIfExists(e2e, 'post', '/auth/register');
  cloneIfExists(e2e, 'put',  '/settings');
  cloneIfExists(e2e, 'post', '/currencies');
  cloneIfExists(e2e, 'post', '/fx-rates');
  cloneIfExists(e2e, 'post', '/items');
  cloneIfExists(e2e, 'post', '/clients');
  cloneIfExists(e2e, 'post', '/warehouses');
  cloneIfExists(e2e, 'post', '/stock/receipts');
  cloneIfExists(e2e, 'post', '/invoices/draft');
  cloneIfExists(e2e, 'post', '/invoices/{id}/confirm');
  cloneIfExists(e2e, 'get',  '/invoices/{id}/normalized');
  cloneIfExists(e2e, 'get',  '/invoices/{id}/pdf');
  cloneIfExists(e2e, 'post', '/invoices/{id}/normalize');
  cloneIfExists(e2e, 'get',  '/integrations/status');

  // Users Admin : clone les endpoints Users si définis
  cloneIfExists(users, 'get',  '/users');
  cloneIfExists(users, 'post', '/users');
  cloneIfExists(users, 'get',  '/users/{id}');
  cloneIfExists(users, 'patch','/users/{id}');
  cloneIfExists(users, 'get',  '/users/{id}/roles');
  cloneIfExists(users, 'put',  '/users/{id}/roles');
  cloneIfExists(users, 'put',  '/users/{id}/status');
  cloneIfExists(users, 'put',  '/users/{id}/default-tenant');
  cloneIfExists(users, 'delete','/users/{id}');

  // Ajoute les runners en fin de collection (sera remplacé si curatedItems est utilisé)
  coll.items.add(e2e);
  coll.items.add(users);
  }

  // Finalization des URLs sera faite après sérialisation en JSON, pour imposer le format
  // { raw, host: ['{{baseUrl}}'], path: [...], query: [...] }

  // Écrit la collection (supprime la clé racine inattendue "_" si présente)
  // Convertit la structure en JSON manipulable
  const outJson = coll.toJSON();
  if (outJson && outJson._) delete outJson._;

  // Supprime l'auth top-level et les variables de collection pour ressembler à l'exemple donné
  if (outJson) {
    delete outJson.auth;
    delete outJson.variable;
    // Retirer protocolProfileBehavior au niveau top-level si présent
    if (outJson.protocolProfileBehavior) delete outJson.protocolProfileBehavior;
  }

  // Remplace la structure par la version curatée si des éléments ont été construits
  if (Array.isArray(curatedItems) && curatedItems.length) {
    outJson.item = curatedItems;
  } else {
    // Mode strict TAGS (défaut) — réordonner selon openapi.tags et injecter les descriptions de tag
    const applyStrictTagStructure = (obj) => {
      if (!obj || !Array.isArray(obj.item)) return;
      const tags = Array.isArray(openapi.tags) ? openapi.tags : [];
      const order = tags.map(t => t && t.name).filter(Boolean);
      const descMap = new Map(tags.map(t => [t.name, t.description || '']));
      // Réordonner les groupes racine selon l'ordre de 'tags'
      obj.item.sort((a, b) => {
        const ai = order.indexOf(String(a && a.name || ''));
        const bi = order.indexOf(String(b && b.name || ''));
        if (ai === -1 && bi === -1) return 0;
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      });
      // Injecter description de tag si manquante
      obj.item.forEach(group => {
        if (group && group.name && descMap.has(group.name)) {
          if (!group.description) group.description = descMap.get(group.name);
        }
      });
    };
    applyStrictTagStructure(outJson);
  }

  // Forcer le format URL objet (raw/host/path/query) sur toutes les requêtes et exemples
  const finalizeUrlObjects = (obj) => {
    const toUrlObj = (u) => {
      let pathSegs = [];
      let queryArr = [];
      let raw = '';
      if (typeof u === 'string') {
        raw = u;
        const rawNoVar = raw.replace(/^\{\{baseUrl\}\}/, '');
        const parts = rawNoVar.split('?');
        const pathPart = parts[0] || '';
        const queryPart = parts[1] || '';
        pathSegs = pathPart.replace(/^\//, '').split('/').filter(Boolean);
        if (queryPart) {
          queryArr = queryPart.split('&').filter(Boolean).map(p => {
            const kv = p.split('=');
            return { key: decodeURIComponent(kv[0] || ''), value: kv.length > 1 ? decodeURIComponent(kv.slice(1).join('=')) : '' };
          });
        }
      } else if (u && typeof u === 'object') {
        if (Array.isArray(u.path)) pathSegs = u.path;
        else if (typeof u.path === 'string') pathSegs = u.path.replace(/^\//, '').split('/').filter(Boolean);
        if (Array.isArray(u.query)) queryArr = u.query.map(q => ({ key: q.key, value: q.value }));
        if (typeof u.raw === 'string') raw = u.raw;
      }
      if (!raw) {
        const pathStr = pathSegs.length ? '/' + pathSegs.join('/') : '';
        let qStr = '';
        if (queryArr.length) {
          const kv = queryArr.map(q => (q && q.key != null)
            ? encodeURIComponent(String(q.key)) + (q.value != null ? '=' + encodeURIComponent(String(q.value)) : '')
            : ''
          ).filter(Boolean).join('&');
          qStr = kv ? ('?' + kv) : '';
        }
        raw = '{{baseUrl}}' + pathStr + qStr;
      } else if (!/^\{\{baseUrl\}\}/.test(raw)) {
        // Si raw ne commence pas par {{baseUrl}}, préfixer si c'est un chemin relatif
        if (/^\//.test(raw)) raw = '{{baseUrl}}' + raw;
      }
      const urlObj = { raw, host: ['{{baseUrl}}'], path: pathSegs };
      if (queryArr.length) urlObj.query = queryArr;
      return urlObj;
    };
    const sanitizeHeaders = (headers) => {
      if (!Array.isArray(headers)) return headers;
      // Remove converter placeholders and duplicates for critical headers
      const cleaned = headers.filter(h => {
        const val = typeof h.value === 'string' ? h.value : '';
        const desc = typeof h.description === 'string' ? h.description : '';
        if (/Added as a part of security scheme/i.test(desc)) return false;
        if (/<token>|<API Key>/i.test(val)) return false;
        return true;
      });
      // Deduplicate by lower-cased key, keeping the last occurrence
      const map = new Map();
      cleaned.forEach(h => map.set(String(h.key || '').toLowerCase(), h));
      return Array.from(map.values());
    };
    const processItem = (node) => {
      if (!node) return;
      if (Array.isArray(node.item)) node.item.forEach(processItem);
      // Strip protocolProfileBehavior at item level
      if (node.protocolProfileBehavior) delete node.protocolProfileBehavior;
      if (node.request) {
        if (node.request.url != null) node.request.url = toUrlObj(node.request.url);
        // Retire tout bloc auth au niveau requête
        if (node.request.auth) delete node.request.auth;
        // Strip protocolProfileBehavior at request level
        if (node.request.protocolProfileBehavior) delete node.request.protocolProfileBehavior;
        // Sanitize headers on the request
        if (Array.isArray(node.request.header)) node.request.header = sanitizeHeaders(node.request.header);
      }
      if (Array.isArray(node.response)) {
        node.response.forEach(resp => {
          if (resp && resp.originalRequest) {
            if (resp.originalRequest.url != null) {
              resp.originalRequest.url = toUrlObj(resp.originalRequest.url);
            }
            if (resp.originalRequest.auth) delete resp.originalRequest.auth;
            if (resp.originalRequest.protocolProfileBehavior) delete resp.originalRequest.protocolProfileBehavior;
            if (Array.isArray(resp.originalRequest.header)) {
              resp.originalRequest.header = sanitizeHeaders(resp.originalRequest.header);
            }
          }
        });
      }
    };
    if (Array.isArray(obj.item)) obj.item.forEach(processItem);
  };
  finalizeUrlObjects(outJson);

  // Harmonise info.name et description comme dans l'exemple fourni
  if (outJson && outJson.info) {
    outJson.info.name = 'SFE Backend — FULL API (NestJS + MongoDB + DGI)';
    outJson.info.description = "Collection complète et commentée pour l'API SFE.";
  }
  // Normalise toutes les descriptions en chaînes (évite les objets description incomplets)
  const normalizeDescriptions = (node) => {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach(normalizeDescriptions);
      return;
    }
    if (typeof node === 'object') {
      if (node.description && typeof node.description === 'object') {
        const d = node.description;
        node.description = typeof d.content === 'string' ? d.content : '';
      }
      for (const k of Object.keys(node)) {
        normalizeDescriptions(node[k]);
      }
    }
  };
  normalizeDescriptions(outJson);

  // Réécrit l'objet final avec info en premier (pour compat Postman)
  // Supprime récursivement toutes les clés "_" (métadonnées non-standards parfois ajoutées par le converter)
  const stripUnderscoreKeys = (node) => {
    if (!node) return;
    if (Array.isArray(node)) return node.forEach(stripUnderscoreKeys);
    if (typeof node === 'object') {
      if (Object.prototype.hasOwnProperty.call(node, '_')) delete node._;
      for (const k of Object.keys(node)) {
        stripUnderscoreKeys(node[k]);
      }
    }
  };
  stripUnderscoreKeys(outJson);

  // Supprime récursivement toutes les clés "id" (conflits potentiels à l'import Postman)
  const stripIds = (node) => {
    if (!node) return;
    if (Array.isArray(node)) return node.forEach(stripIds);
    if (typeof node === 'object') {
      if (Object.prototype.hasOwnProperty.call(node, 'id')) delete node.id;
      for (const k of Object.keys(node)) {
        stripIds(node[k]);
      }
    }
  };
  stripIds(outJson);

  const finalJson = { info: outJson.info, item: outJson.item };
  if (outJson.event) finalJson.event = outJson.event;
  fs.writeFileSync(OUT_COLL, JSON.stringify(finalJson, null, 2), 'utf-8');
  console.log('[OK] Collection Postman ->', OUT_COLL);

  // 5) Environnement Postman (uniquement des variables; pas d’exemples de payload)
  const env = {
    name: 'SFE Local (Full)',
    values: ENV_VARS.map(v => ({ key: v.key, value: v.value, type: 'text', enabled: true })),
    _postman_variable_scope: 'environment',
    _postman_exported_at: new Date().toISOString(),
    _postman_exported_using: 'SFE Generator'
  };
  // Par précaution, supprimer toute clé "id" résiduelle
  stripIds(env);
  fs.writeFileSync(OUT_ENV, JSON.stringify(env, null, 2), 'utf-8');
  console.log('[OK] Environnement Postman ->', OUT_ENV);
});
