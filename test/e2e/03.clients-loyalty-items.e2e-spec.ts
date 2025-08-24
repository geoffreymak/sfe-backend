import { INestApplication } from '@nestjs/common';
import { createTestingApp, http } from '../utils/app-bootstrap';
import { randEmail, rand } from '../utils/factories';
import type { Test as SupertestTest } from 'supertest';
import { getConnectionToken } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import { Types } from 'mongoose';

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

describe('Clients, Loyalty & Items (E2E)', () => {
  let app: INestApplication;
  let token = '';
  let tenantId = '';
  let clientForLoyalty = '';
  let clientNotEnrolled = '';

  beforeAll(async () => {
    app = await createTestingApp();
    const res = await http(app)
      .post('/auth/register')
      .send({
        email: randEmail(),
        password: 'Password123!',
        organizationName: 'Org CLI ' + rand(),
      })
      .expect(201);
    if (!isRegisterResponse(res.body))
      throw new Error('Invalid register response');
    token = res.body.accessToken;
    tenantId = res.body.tenantId;
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

  async function seedLoyaltyPoints(id: string, points: number) {
    const conn = app.get<Connection>(getConnectionToken());
    // Access native Db to update directly
    const nativeDb = (conn as unknown as { db?: any }).db;
    await nativeDb
      ?.collection('clients')
      .updateOne(
        { _id: new Types.ObjectId(id) },
        { $set: { 'loyalty.points': points } },
      );
  }

  describe('Clients', () => {
    it('POST /clients fails for PM without nif', async () => {
      const res = await authed()
        .post('/clients')
        .send({ type: 'PM', denomination: 'ACME SARL' })
        .expect(400);
      expect(res.body?.detail).toBe(
        'For PM, denomination and nif are required',
      );
    });

    it('POST /clients fails for AO without refExo', async () => {
      const res = await authed()
        .post('/clients')
        .send({ type: 'AO', name: 'Ambassade' })
        .expect(400);
      expect(res.body?.detail).toBe('For AO, name and refExo are required');
    });

    it('POST /clients fails for PL without nif', async () => {
      const res = await authed()
        .post('/clients')
        .send({ type: 'PL', name: 'Dr. Kabila' })
        .expect(400);
      expect(res.body?.detail).toBe('For PC/PL, name and nif are required');
    });

    it('POST /clients creates PM OK and computes displayName', async () => {
      const res = await authed()
        .post('/clients')
        .send({ type: 'PM', denomination: 'Test SARL', nif: 'A0000000' })
        .expect(201);
      expect(res.body?.displayName).toBe('Test SARL');
      clientForLoyalty = String(res.body?._id ?? '');
      expect(clientForLoyalty).not.toBe('');
    });

    it('POST /clients creates PP (not enrolled) for negative tests', async () => {
      const res = await authed()
        .post('/clients')
        .send({ type: 'PP', name: 'John Doe' })
        .expect(201);
      clientNotEnrolled = String(res.body?._id ?? '');
      expect(clientNotEnrolled).not.toBe('');
    });
  });

  describe('Items', () => {
    it('creates valid BIE item with priceHT only', async () => {
      const res = await authed()
        .post('/items')
        .send({
          code: 'SKU-' + rand(),
          name: 'Stylo bille',
          type: 'BIE',
          unit: 'pcs',
          taxGroupDefault: 'B',
          priceHT: '1000.00',
        })
        .expect(201);
      expect(res.body?.type).toBe('BIE');
      expect(res.body?.taxGroupDefault).toBe('B');
    });

    it('rejects item when both priceHT and priceTTC are provided', async () => {
      const res = await authed()
        .post('/items')
        .send({
          code: 'SKU-' + rand(),
          name: 'Stylo rouge',
          type: 'BIE',
          unit: 'pcs',
          taxGroupDefault: 'B',
          priceHT: '1000.00',
          priceTTC: '1160.00',
        })
        .expect(400);
      expect(res.body?.detail).toBe(
        'priceHT and priceTTC are mutually exclusive',
      );
    });

    it('rejects item when neither priceHT nor priceTTC is provided', async () => {
      const res = await authed()
        .post('/items')
        .send({
          code: 'SKU-' + rand(),
          name: 'Stylo vert',
          type: 'BIE',
          unit: 'pcs',
          taxGroupDefault: 'B',
        })
        .expect(400);
      expect(res.body?.detail).toBe(
        'Either priceHT or priceTTC must be provided',
      );
    });

    it("rejects TAX item with group 'B'", async () => {
      const res = await authed()
        .post('/items')
        .send({
          code: 'TAX-' + rand(),
          name: 'Taxe invalide',
          type: 'TAX',
          unit: 'u',
          taxGroupDefault: 'B',
          priceHT: '10.00',
        })
        .expect(400);
      expect(res.body?.detail).toBe(
        "For TAX items, taxGroupDefault must be one of ['L','N']",
      );
    });

    it("accepts TAX item with group 'L'", async () => {
      const res = await authed()
        .post('/items')
        .send({
          code: 'TAX-' + rand(),
          name: 'Taxe L',
          type: 'TAX',
          unit: 'u',
          taxGroupDefault: 'L',
          priceTTC: '10.00',
        })
        .expect(201);
      expect(res.body?.taxGroupDefault).toBe('L');
    });
  });

  describe('Loyalty', () => {
    it('enrolls client with optional cardId', async () => {
      const res = await authed()
        .post('/loyalty/enroll')
        .send({ clientId: clientForLoyalty, cardId: 'CARD-' + rand() })
        .expect(201);
      expect(res.body?.enrolled).toBe(true);
      expect(res.body?.client?.loyalty?.enrolled).toBe(true);
    });

    it('redeem fails when not enough points', async () => {
      const res = await authed()
        .post('/loyalty/redeem')
        .send({
          clientId: clientForLoyalty,
          points: 10,
          reason: 'test',
          idempotencyKey: 'idem-' + rand(),
        })
        .expect(400);
      expect(res.body?.detail).toBe('Insufficient points');
    });

    it('seeds points and redeems with idempotency', async () => {
      await seedLoyaltyPoints(clientForLoyalty, 500);
      const idem = 'idem-' + rand();

      const first = await authed()
        .post('/loyalty/redeem')
        .send({
          clientId: clientForLoyalty,
          points: 100,
          reason: 'reward',
          idempotencyKey: idem,
        })
        .expect(201);
      expect(first.body?.transaction?.points).toBe(100);
      const remaining1 = Number(first.body?.client?.loyalty?.points ?? -1);
      expect(remaining1).toBeGreaterThanOrEqual(0);

      const second = await authed()
        .post('/loyalty/redeem')
        .send({
          clientId: clientForLoyalty,
          points: 100,
          reason: 'reward',
          idempotencyKey: idem,
        })
        .expect(201); // controller returns 201 for POST, even when idempotent
      expect(second.body?.idempotent).toBe(true);
      const remaining2 = Number(second.body?.client?.loyalty?.points ?? -1);
      expect(remaining2).toBe(remaining1); // no further decrement
    });

    it('redeem fails when client not enrolled', async () => {
      const res = await authed()
        .post('/loyalty/redeem')
        .send({
          clientId: clientNotEnrolled,
          points: 10,
          reason: 'x',
          idempotencyKey: 'idem-' + rand(),
        })
        .expect(400);
      expect(res.body?.detail).toBe('Client is not enrolled in loyalty');
    });
  });

  describe('Invoices DGI compliance', () => {
    let draftAO = '';

    it('draft FV with AO client lacking refExo, confirm fails', async () => {
      const draft = await authed()
        .post('/invoices/draft')
        .send({
          modePrix: 'TTC',
          type: 'FV',
          client: { type: 'AO', name: 'Ambassade' },
          lines: [
            {
              kind: 'BIE',
              group: 'B',
              label: 'Stylo',
              qty: '1.000',
              unitPrice: '1160.00',
            },
          ],
        })
        .expect(201);
      draftAO = String(draft.body?._id ?? '');
      expect(draftAO).not.toBe('');

      const conf = await authed()
        .post(`/invoices/${draftAO}/confirm`)
        .send({})
        .expect(400);
      expect(conf.body?.detail).toBe('AO client requires refExo');
    });

    it('confirm FA without avoir.nature fails', async () => {
      const draft = await authed()
        .post('/invoices/draft')
        .send({
          modePrix: 'TTC',
          type: 'FA',
          client: { type: 'PM', denomination: 'Test SARL', nif: 'A0000000' },
          lines: [
            {
              kind: 'BIE',
              group: 'B',
              label: 'Stylo',
              qty: '1.000',
              unitPrice: '1160.00',
            },
          ],
        })
        .expect(201);
      const id = String(draft.body?._id ?? '');
      const conf = await authed()
        .post(`/invoices/${id}/confirm`)
        .send({})
        .expect(400);
      expect(conf.body?.detail).toBe('FA/EA require avoir.nature');
    });

    it('confirm FA with COR nature but missing originInvoiceRef fails', async () => {
      const draft = await authed()
        .post('/invoices/draft')
        .send({
          modePrix: 'TTC',
          type: 'FA',
          client: { type: 'PM', denomination: 'Test2 SARL', nif: 'A0000001' },
          lines: [
            {
              kind: 'BIE',
              group: 'B',
              label: 'Stylo',
              qty: '1.000',
              unitPrice: '1160.00',
            },
          ],
          avoir: { nature: 'COR' },
        })
        .expect(201);
      const id = String(draft.body?._id ?? '');
      const conf = await authed()
        .post(`/invoices/${id}/confirm`)
        .send({})
        .expect(400);
      expect(conf.body?.detail).toBe(
        'FA/EA require originInvoiceRef for this nature',
      );
    });

    it("confirm FA with RRR nature doesn't require originInvoiceRef", async () => {
      const draft = await authed()
        .post('/invoices/draft')
        .send({
          modePrix: 'TTC',
          type: 'FA',
          client: { type: 'PM', denomination: 'Test3 SARL', nif: 'A0000002' },
          lines: [
            {
              kind: 'BIE',
              group: 'B',
              label: 'Stylo',
              qty: '1.000',
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
    });
  });
});
