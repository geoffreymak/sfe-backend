import { INestApplication } from '@nestjs/common';
import { createTestingApp, http } from '../utils/app-bootstrap';
import { randEmail, rand } from '../utils/factories';
import type { Test as SupertestTest } from 'supertest';

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

describe('Settings, Currencies & FX (E2E)', () => {
  let app: INestApplication;
  let token = '';
  let tenantId = '';

  beforeAll(async () => {
    app = await createTestingApp();
    const res = await http(app)
      .post('/auth/register')
      .send({
        email: randEmail(),
        password: 'Password123!',
        organizationName: 'Org FX ' + rand(),
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
    const agent = http(app); // SuperTest<SupertestTest>
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

  describe('Settings', () => {
    it('GET /settings returns defaults', async () => {
      const res = await authed().get('/settings').expect(200);
      expect(res.body).toBeDefined();
      expect(res.body?.currency?.base).toBe('CDF');
      expect(res.body?.currency?.defaultAlt).toBe('USD');
      expect(typeof res.body?.invoice?.idempotencyTTLHours).toBe('number');
    });

    it('PUT /settings updates allowed fields but keeps base/defaultAlt locked', async () => {
      const payload = {
        currency: {
          base: 'CDF',
          defaultAlt: 'USD',
          allowed: ['USD', 'EUR'],
          decimals: 3,
          rounding: 'HALF_UP',
        },
        invoice: {
          defaultModePrix: 'TTC',
          numbering: { prefix: 'FV', yearlyReset: true, width: 6 },
          idempotencyTTLHours: 24,
        },
        loyalty: {
          enabled: false,
          earn: {
            base: 'TTC',
            rate: 1,
            baseUnit: 1000,
            excludeTaxGroups: ['L', 'N'],
          },
          redeem: { pointValueCDF: 10 },
        },
        stock: {
          costingMethod: 'AVG',
          allowNegativeStock: false,
          reservationsEnabled: false,
        },
        integration: {
          mode: 'mock',
          safety: {
            subtotalCheck: true,
            confirmDeadlineSec: 120,
            pendingMax: 10,
          },
        },
      } as const;

      const res = await authed().put('/settings').send(payload).expect(200);
      expect(res.body?.currency?.decimals).toBe(3);
      expect(res.body?.currency?.base).toBe('CDF');
      expect(res.body?.currency?.defaultAlt).toBe('USD');
    });

    it('PUT /settings fails when changing currency.base', async () => {
      const bad = {
        currency: {
          base: 'USD',
          defaultAlt: 'USD',
          allowed: [],
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
          earn: {
            base: 'TTC',
            rate: 1,
            baseUnit: 1000,
            excludeTaxGroups: ['L', 'N'],
          },
          redeem: { pointValueCDF: 10 },
        },
        stock: {
          costingMethod: 'AVG',
          allowNegativeStock: false,
          reservationsEnabled: false,
        },
        integration: {
          mode: 'mock',
          safety: {
            subtotalCheck: true,
            confirmDeadlineSec: 120,
            pendingMax: 10,
          },
        },
      } as const;
      await authed().put('/settings').send(bad).expect(400);
    });

    it('PUT /settings fails when changing currency.defaultAlt', async () => {
      const bad = {
        currency: {
          base: 'CDF',
          defaultAlt: 'EUR',
          allowed: [],
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
          earn: {
            base: 'TTC',
            rate: 1,
            baseUnit: 1000,
            excludeTaxGroups: ['L', 'N'],
          },
          redeem: { pointValueCDF: 10 },
        },
        stock: {
          costingMethod: 'AVG',
          allowNegativeStock: false,
          reservationsEnabled: false,
        },
        integration: {
          mode: 'mock',
          safety: {
            subtotalCheck: true,
            confirmDeadlineSec: 120,
            pendingMax: 10,
          },
        },
      } as const;
      await authed().put('/settings').send(bad).expect(400);
    });

    it('GET /settings/public requires X-Tenant-Id and returns public settings', async () => {
      await http(app).get('/settings/public').expect(400);
      const res = await http(app)
        .get('/settings/public')
        .set('X-Tenant-Id', tenantId)
        .expect(200);
      expect(res.body?.currency?.base).toBe('CDF');
      expect(res.body?.integration?.emcf?.token).toBeUndefined();
    });
  });

  describe('Currencies', () => {
    it('POST /currencies creates CDF, USD, EUR', async () => {
      await authed()
        .post('/currencies')
        .send({ code: 'CDF', name: 'Franc Congolais', symbol: 'FC' })
        .expect(201);
      await authed()
        .post('/currencies')
        .send({ code: 'USD', name: 'US Dollar', symbol: '$' })
        .expect(201);
      await authed()
        .post('/currencies')
        .send({ code: 'EUR', name: 'Euro', symbol: '€' })
        .expect(201);
    });

    it('PATCH /currencies rejects disabling USD or CDF, allows EUR', async () => {
      await authed()
        .patch('/currencies/USD')
        .send({ enabled: false })
        .expect(400);
      await authed()
        .patch('/currencies/CDF')
        .send({ enabled: false })
        .expect(400);
      const res = await authed()
        .patch('/currencies/EUR')
        .send({ enabled: false })
        .expect(200);
      expect(res.body?.enabled).toBe(false);
    });

    it('DELETE /currencies forbids USD/CDF and allows EUR', async () => {
      await authed().delete('/currencies/USD').expect(400);
      await authed().delete('/currencies/CDF').expect(400);
      const res = await authed().delete('/currencies/EUR').expect(200);
      expect(res.body?.deleted).toBe(true);
    });
  });

  describe('FX Rates', () => {
    it('POST /fx-rates rejects invalid base and quote', async () => {
      await authed()
        .post('/fx-rates')
        .send({
          base: 'USD',
          quote: 'USD',
          rate: '1.00',
          validFrom: new Date().toISOString(),
        })
        .expect(400);
      await authed()
        .post('/fx-rates')
        .send({
          base: 'CDF',
          quote: 'CDF',
          rate: '1.00',
          validFrom: new Date().toISOString(),
        })
        .expect(400);
    });

    it('POST /fx-rates creates USD and EUR rates', async () => {
      const now = new Date().toISOString();
      await authed()
        .post('/fx-rates')
        .send({ base: 'CDF', quote: 'USD', rate: '2750.50', validFrom: now })
        .expect(201);
      await authed()
        .post('/fx-rates')
        .send({ base: 'CDF', quote: 'EUR', rate: '3000.00', validFrom: now })
        .expect(201);
    });

    it('GET /fx-rates/latest returns latest USD rate', async () => {
      const res = await authed()
        .get('/fx-rates/latest')
        .query({ quote: 'USD' })
        .expect(200);
      expect(res.body?.quote).toBe('USD');
    });

    it('GET /fx-rates list is filterable', async () => {
      const list = await authed()
        .get('/fx-rates')
        .query({ quote: 'USD' })
        .expect(200);
      expect(Array.isArray(list.body)).toBe(true);
      expect(list.body.length).toBeGreaterThan(0);
    });
  });

  describe('Invoices with equivalent currency', () => {
    let draftId = '';
    it('POST /invoices/draft creates a draft with totals', async () => {
      const res = await authed()
        .post('/invoices/draft')
        .send({
          modePrix: 'TTC',
          type: 'FV',
          client: { type: 'PM', denomination: 'Test SARL', nif: 'A0000000' },
          lines: [
            {
              kind: 'BIE',
              group: 'B',
              label: 'Stylo bleu',
              qty: '1.000',
              unitPrice: '1160.00',
            },
          ],
        })
        .expect(201);
      expect(res.body?.status).toBe('DRAFT');
      draftId = String(res.body?._id ?? '');
      expect(draftId).not.toBe('');
    });

    it('POST /invoices/:id/confirm confirms with equivalent USD and is idempotent', async () => {
      const idemKey = 'idem-' + rand();
      const first = await authed()
        .post(`/invoices/${draftId}/confirm`)
        .set('X-Idempotency-Key', idemKey)
        .send({ equivalentCurrency: { code: 'USD' } })
        .expect(201);
      expect(first.body?.status).toBe('CONFIRMED');
      expect(first.body?.number).toBeDefined();
      expect(first.body?.equivalentCurrency?.code).toBe('USD');

      const second = await authed()
        .post(`/invoices/${draftId}/confirm`)
        .set('X-Idempotency-Key', idemKey)
        .send({ equivalentCurrency: { code: 'USD' } })
        .expect(200);
      expect(second.body).toEqual(first.body);
    });
  });
});
