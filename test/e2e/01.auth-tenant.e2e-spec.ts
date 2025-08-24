import { INestApplication } from '@nestjs/common';
import { createTestingApp, http } from '../utils/app-bootstrap';
import { randEmail } from '../utils/factories';

type RegisterResponse = { accessToken: string; tenantId: string };
type LoginResponse = { accessToken: string };

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null;
}

function hasStringProp(o: Record<string, unknown>, k: string): boolean {
  return typeof o[k] === 'string';
}

function isRegisterResponse(x: unknown): x is RegisterResponse {
  return (
    isObject(x) &&
    hasStringProp(x, 'accessToken') &&
    hasStringProp(x, 'tenantId')
  );
}

function isLoginResponse(x: unknown): x is LoginResponse {
  return isObject(x) && hasStringProp(x, 'accessToken');
}

describe('Auth & Tenant', () => {
  let app: INestApplication;
  let token = '';
  let tenantId = '';
  beforeAll(async () => {
    app = await createTestingApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('register returns accessToken + tenantId', async () => {
    const res = await http(app)
      .post('/auth/register')
      .send({
        email: randEmail(),
        password: 'Password123!',
        organizationName: 'OrgTest',
      })
      .expect(201);
    const body: unknown = res.body;
    expect(isRegisterResponse(body)).toBe(true);
    if (!isRegisterResponse(body)) throw new Error('Invalid register response');
    token = body.accessToken;
    tenantId = body.tenantId;
  });

  it('login ok', async () => {
    const email = randEmail();
    await http(app)
      .post('/auth/register')
      .send({ email, password: 'Password123!' })
      .expect(201);
    const res = await http(app)
      .post('/auth/login')
      .send({ email, password: 'Password123!' })
      .expect(200);
    expect(isLoginResponse(res.body)).toBe(true);
  });

  it('GET /auth/me returns 200 with token', async () => {
    await http(app)
      .get('/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  it('GET /clients requires X-Tenant-Id', async () => {
    await http(app)
      .get('/clients')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
    await http(app)
      .get('/clients')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Tenant-Id', tenantId)
      .expect(200);
  });
});
