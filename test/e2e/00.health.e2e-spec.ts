import { INestApplication } from '@nestjs/common';
import { createTestingApp, http } from '../utils/app-bootstrap';

describe('Health & Basics', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createTestingApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('/health -> {status:ok}', async () => {
    await http(app).get('/health').expect(200).expect({ status: 'ok' });
  });

  it('ProblemDetails on 404', async () => {
    const res = await http(app).get('/__notfound__').expect(404);
    expect(res.headers['content-type']).toMatch(
      /application\/json|problem\+json/i,
    );
    expect(res.body).toHaveProperty('status', 404);
  });
});
