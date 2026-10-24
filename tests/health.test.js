const request = require('supertest');
const app = require('../src/app');

describe('health endpoints', () => {
  test('returns the service health payload', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'healthy', service: 'erp-copilot' });
  });

  test('returns copilot health from its mounted route', async () => {
    const response = await request(app).get('/api/copilot/health');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('healthy');
  });

  test('returns JSON 404s', async () => {
    const response = await request(app).get('/missing');
    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Not found');
  });
});
