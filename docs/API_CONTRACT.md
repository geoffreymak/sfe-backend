# API Contract (v1)

## Auth & Tenants

- POST /auth/register {email,password,organizationName?} → {accessToken, tenantId}
- POST /auth/login {email,password} → {accessToken}
- GET /me
- Header requis global: **X-Tenant-Id: <tenantId>**

## Settings (tenant)

- GET /settings
- PUT /settings { currency, invoice, loyalty, stock, integration }
- GET /settings/public
- GET/PUT /settings/integration
  ```ts
  integration: {
    mode: 'emcf'|'mcf'|'mock',
    emcf: { baseUrlInfo, baseUrlInvoice, token, isf, nif },
    mcf:  { port, baud, dataBits, parity, stopBits, isf, nif },
    safety: { subtotalCheck:boolean, confirmDeadlineSec:number, pendingMax:number }
  }
  ```

Currencies & FX

GET/POST/PATCH/DELETE /currencies

CDF: isBase=true verrouillé; USD: isDefaultAlt=true non supprimable.

GET /fx-rates/latest?quote=USD

GET/POST /fx-rates

Clients (types: PP/PM/PC/PL/AO)

CRUD /clients

POST /loyalty/enroll {clientId,cardId?}

POST /loyalty/redeem {clientId,points,reason,idempotencyKey}

GET /loyalty/transactions?clientId

Items (BIE/SER/TAX)

CRUD /items

Contrainte: TAX seulement groupes L ou N.

Stock (BIE seulement)

POST /stock/receipts {warehouseId, lines:[{itemId,qty,unitCost?,lot?,serial?[]}]}

POST /stock/transfers {fromWarehouseId,toWarehouseId, lines:[{itemId,qty,lot?}]}

POST /stock/adjustments {warehouseId, lines:[{itemId,qtyDelta,reason}]}

GET /stock/alerts

CRUD /warehouses

Invoices

POST /invoices/draft

POST /invoices/:id/confirm (body optionnel: {equivalentCurrency:{code}})

GET /invoices/:id/pdf

GET /invoices/:id/normalized

POST /invoices/:id/dispatch (queue e-MCF)

POST /invoices/:id/normalize (orchestrateur: e-MCF ou MCF selon settings.integration.mode)

Invoice model (extraits)
{
tenantId, number, modePrix: 'HT'|'TTC', type: 'FV'|'FT'|'FA'|'EV'|'ET'|'EA',
client: { type:'PP'|'PM'|'PC'|'PL'|'AO', ... , refExo?:string },
lines: [{ itemId, kind:'BIE'|'SER'|'TAX', group:'A'..'P', qty:Decimal128, unitPrice:Decimal128, ... }],
totals: { ht:Decimal128, vat:Decimal128, ttc:Decimal128 },
equivalentCurrency?: { code, rate, provider:'manual', at:Date },
security?: {
source:'emcf'|'mcf',
codeDefDgi:string, nimOrMid:string, counters:string,
certifiedAt:Date, qr:{ payload:string, base64?:string }
},
emcf?: { uid?:string, totalsFromEmcf?:any, lastAction?:'POSTED'|'CONFIRMED'|'CANCELED' },
mcf?: { lastCmd?:string, dt?:string, mid?:string, sig?:string }
}

Integrations

GET /integrations/status // ping e-MCF /api/info/status ou MCF C1h/C2h

POST /integrations/test-connection

e-MCF proxy (option)

POST /emcf/invoices // relaie POST facture

POST /emcf/invoices/:uid/confirm

POST /emcf/invoices/:uid/cancel

GET /emcf/info/\* // status, taxGroups, invoiceTypes, paymentTypes, clientTypes, referenceTypes, itemTypes, currencyRates

MCF driver (option)

POST /mcf/open

POST /mcf/item

POST /mcf/subtotal

POST /mcf/pay

POST /mcf/finalize

POST /mcf/cancel

Reports

GET /reports/mcf-journal?state=&dateFrom=&dateTo=&page=&limit=

GET /reports/sales-summary?from=&to=&groupBy=day|month|group|type
