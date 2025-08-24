import { INestApplication } from '@nestjs/common';
import { createTestingApp, http } from '../utils/app-bootstrap';
import type { Test as SupertestTest } from 'supertest';
import { getConnectionToken } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import { Types } from 'mongoose';
import type { Db } from 'mongodb';
import { rand, randEmail } from '../utils/factories';

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null;
}

function hasStringProp(o: Record<string, unknown>, k: string): boolean {
  return typeof o[k] === 'string';
}

type RegisterResponse = { accessToken: string; tenantId: string };
function isRegisterResponse(x: unknown): x is RegisterResponse {
  return (
    isObject(x) &&
    hasStringProp(x, 'accessToken') &&
    hasStringProp(x, 'tenantId')
  );
}

function toNum(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isNaN(n) ? 0 : n;
  }
  if (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as { toString?: () => string }).toString === 'function'
  ) {
    const s = (v as { toString: () => string }).toString();
    const n = Number(s);
    return Number.isNaN(n) ? 0 : n;
  }
  return 0;
}

describe('Stock flow (E2E)', () => {
  let app: INestApplication;
  let token = '';
  let tenantId = '';
  let warehouseId = '';
  let itemId = '';
  let nativeDb: Db | undefined;

  beforeAll(async () => {
    app = await createTestingApp();
    const res = await http(app)
      .post('/auth/register')
      .send({
        email: randEmail(),
        password: 'Password123!',
        organizationName: 'Org STOCK ' + rand(),
      })
      .expect(201);
    if (!isRegisterResponse(res.body))
      throw new Error('Invalid register response');
    token = res.body.accessToken;
    tenantId = res.body.tenantId;

    const conn = app.get<Connection>(getConnectionToken());
    nativeDb = (conn as unknown as { db?: any }).db;
  });

  afterAll(async () => {
    await app.close();
  });

  function authed() {
    const agent = http(app);
    const withHeaders = (req: SupertestTest): SupertestTest =>
      req.set('Authorization', `Bearer ${token}`).set('X-Tenant-Id', tenantId);
    return {
      get: (url: string): SupertestTest => withHeaders(agent.get(url)),
      post: (url: string): SupertestTest => withHeaders(agent.post(url)),
      put: (url: string): SupertestTest => withHeaders(agent.put(url)),
      patch: (url: string): SupertestTest => withHeaders(agent.patch(url)),
      delete: (url: string): SupertestTest => withHeaders(agent.delete(url)),
    };
  }

  async function readStockQtyAvg() {
    const doc = await nativeDb?.collection('stocks').findOne({
      tenantId: new Types.ObjectId(tenantId),
      warehouseId: new Types.ObjectId(warehouseId),
      itemId: new Types.ObjectId(itemId),
    });
    return { qty: toNum(doc?.qty), avg: toNum(doc?.avgUnitCost) };
  }

  it('creates a warehouse', async () => {
    const res = await authed()
      .post('/warehouses')
      .send({ code: 'WH-' + rand(), name: 'Main' })
      .expect(201);
    warehouseId = String(res.body?._id ?? '');
    expect(warehouseId).not.toBe('');
  });

  it('creates a BIE item with stock tracking and reorder point', async () => {
    const res = await authed()
      .post('/items')
      .send({
        code: 'SKU-' + rand(),
        name: 'Produit A',
        type: 'BIE',
        unit: 'pcs',
        taxGroupDefault: 'B',
        stockTracking: 'simple',
        reorderPoint: '10',
        priceHT: '1000.00',
      })
      .expect(201);
    itemId = String(res.body?._id ?? '');
    expect(itemId).not.toBe('');
  });

  it('processes stock receipts and updates AVG costing', async () => {
    // First receipt: 20 @ 100.00
    await authed()
      .post('/stock/receipts')
      .send({
        warehouseId,
        lines: [{ itemId, qty: '20', unitCost: '100.00' }],
      })
      .expect(201);

    const s1 = await readStockQtyAvg();
    expect(s1.qty).toBeCloseTo(20, 6);
    expect(s1.avg).toBeCloseTo(100, 6);

    // Second receipt: 10 @ 130.00 => new avg = 110.00 over 30 qty
    await authed()
      .post('/stock/receipts')
      .send({
        warehouseId,
        lines: [{ itemId, qty: '10', unitCost: '130.00' }],
      })
      .expect(201);

    const s2 = await readStockQtyAvg();
    expect(s2.qty).toBeCloseTo(30, 6);
    expect(s2.avg).toBeCloseTo(110, 6);
  });

  it('creates and confirms a sales invoice (FV) without mutating stock', async () => {
    const draft = await authed()
      .post('/invoices/draft')
      .send({
        modePrix: 'TTC',
        type: 'FV',
        client: { type: 'PM', denomination: 'ACME SARL', nif: 'A0000000' },
        lines: [
          {
            kind: 'BIE',
            group: 'B',
            label: 'Vente Produit A',
            qty: '5.000',
            unitPrice: '1160.00',
          },
        ],
      })
      .expect(201);
    const id = String(draft.body?._id ?? '');
    expect(id).not.toBe('');

    const conf = await authed()
      .post(`/invoices/${id}/confirm`)
      .send({})
      .expect(201);
    expect(conf.body?.status).toBe('CONFIRMED');

    // Stock unchanged by invoice confirmation
    const s = await readStockQtyAvg();
    expect(s.qty).toBeCloseTo(30, 6);
    expect(s.avg).toBeCloseTo(110, 6);
  });

  it('rejects negative adjustment beyond available stock', async () => {
    const res = await authed()
      .post('/stock/adjustments')
      .send({
        warehouseId,
        lines: [
          {
            itemId,
            qtyDelta: '-40',
            reason: 'attempt oversell',
          },
        ],
      })
      .expect(400);
    expect(res.body?.detail).toBe('Insufficient stock');
  });

  it('simulates a sale via negative adjustment and triggers low stock alert', async () => {
    // Sell 25 units via adjustment
    await authed()
      .post('/stock/adjustments')
      .send({
        warehouseId,
        lines: [
          {
            itemId,
            qtyDelta: '-25',
            reason: 'sale',
          },
        ],
      })
      .expect(201);

    const s = await readStockQtyAvg();
    expect(s.qty).toBeCloseTo(5, 6);
    // AVG costing unchanged by negative adjustment
    expect(s.avg).toBeCloseTo(110, 6);

    const alerts = await authed().get('/stock/alerts').expect(200);
    const items: Array<{ itemId: string }> = alerts.body?.items ?? [];
    const hasOurItem = items.some((it) => String(it.itemId) === itemId);
    expect(alerts.body?.count).toBeGreaterThanOrEqual(1);
    expect(hasOurItem).toBe(true);
  });

  it('confirms a return invoice (FA RRR) and simulates goods return via positive adjustment; alerts clear', async () => {
    const draft = await authed()
      .post('/invoices/draft')
      .send({
        modePrix: 'TTC',
        type: 'FA',
        client: { type: 'PM', denomination: 'ACME2 SARL', nif: 'A0000001' },
        lines: [
          {
            kind: 'BIE',
            group: 'B',
            label: 'Retour Produit A',
            qty: '7.000',
            unitPrice: '1160.00',
          },
        ],
        avoir: { nature: 'RRR' },
      })
      .expect(201);
    const id = String(draft.body?._id ?? '');

    const conf = await authed()
      .post(`/invoices/${id}/confirm`)
      .send({})
      .expect(201);
    expect(conf.body?.status).toBe('CONFIRMED');

    // Simulate return: +7
    await authed()
      .post('/stock/adjustments')
      .send({
        warehouseId,
        lines: [
          {
            itemId,
            qtyDelta: '7',
            reason: 'return',
          },
        ],
      })
      .expect(201);

    const s = await readStockQtyAvg();
    expect(s.qty).toBeCloseTo(12, 6);
    // AVG unchanged by positive adjustment (AVG is updated only by receipts)
    expect(s.avg).toBeCloseTo(110, 6);

    const alerts = await authed().get('/stock/alerts').expect(200);
    const items: Array<{ itemId: string }> = alerts.body?.items ?? [];
    const hasOurItem = items.some((it) => String(it.itemId) === itemId);
    expect(hasOurItem).toBe(false);
  });
});
