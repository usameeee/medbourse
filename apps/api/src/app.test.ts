import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';

describe('GET /api/v1/health', () => {
  it('returns ok status', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('medbourse-api');
    expect(res.body.version).toBe('0.0.1');
    expect(typeof res.body.timestamp).toBe('string');
    expect(res.body.database).toBe('disconnected');
  });
});
