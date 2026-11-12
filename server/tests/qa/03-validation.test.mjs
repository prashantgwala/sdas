import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ApiClient, BASE, CREDENTIALS, assertError, assertOk, assertStatus } from './lib/client.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtures = JSON.parse(fs.readFileSync(path.join(here, 'fixtures.json'), 'utf8'));

const citizen = new ApiClient('citizen');
const clerk = new ApiClient('clerk');
const admin = new ApiClient('admin');
let grievanceId;

before(async () => {
  await citizen.login(CREDENTIALS.citizen.identifier, CREDENTIALS.citizen.password);
  await clerk.login(CREDENTIALS.clerk.identifier, CREDENTIALS.clerk.password);
  await admin.login(CREDENTIALS.superAdmin.identifier, CREDENTIALS.superAdmin.password);
  const created = await citizen.post('/api/v1/grievances', {
    subject: 'QA validation fixture grievance',
    description: 'Fixture used to exercise upload and validation error paths safely.',
    category: fixtures.grievanceCategory._id,
  });
  assertStatus(created, 201, 'validation fixture');
  grievanceId = created.body.data._id;
});

describe('Validation and error handling', () => {
  it('rejects malformed identifiers with a validation error', async () => {
    assertError(await citizen.get('/api/v1/grievances/not-an-id'), 422, 'VALIDATION_ERROR', 'bad grievance id');
    assertError(await citizen.get('/api/v1/grievances/123'), 422, 'VALIDATION_ERROR', 'short id');
    assertError(await citizen.get('/api/v1/documents/zzz/download'), 422, 'VALIDATION_ERROR', 'bad document id');
    assertError(await admin.get('/api/v1/admin/users/abc'), 422, 'VALIDATION_ERROR', 'bad user id');
  });

  it('enforces pagination limits', async () => {
    assertError(await citizen.get('/api/v1/grievances?limit=0'), 422, 'VALIDATION_ERROR', 'limit 0');
    assertError(await citizen.get('/api/v1/grievances?limit=101'), 422, 'VALIDATION_ERROR', 'limit 101');
    assertError(await citizen.get('/api/v1/grievances?page=0'), 422, 'VALIDATION_ERROR', 'page 0');
    assertError(await citizen.get('/api/v1/grievances?page=abc'), 422, 'VALIDATION_ERROR', 'page abc');
    const ok = await citizen.get('/api/v1/grievances?limit=100&page=1');
    assertOk(ok, 'max limit accepted');
    assert.ok(Array.isArray(ok.body.data));
  });

  it('returns structured 404 for unknown routes and methods', async () => {
    assertError(await citizen.get('/api/v1/does-not-exist'), 404, 'NOT_FOUND', 'unknown route');
    assertError(await citizen.delete('/api/v1/grievances'), 404, 'NOT_FOUND', 'unknown method');
    assertError(await new ApiClient('anon').get('/api/nope'), 404, 'NOT_FOUND', 'unknown public route');
  });

  it('validates grievance payloads', async () => {
    const cases = [
      [{ description: 'Valid description that is definitely longer than twenty characters.' }, 'missing subject'],
      [{ subject: 'abc', description: 'Valid description that is definitely longer than twenty characters.' }, 'short subject'],
      [{ subject: 'Valid subject', description: 'too short' }, 'short description'],
      [{ subject: 'Valid subject', description: 'Valid description that is definitely longer than twenty characters.', priority: 'CRITICAL' }, 'invalid priority'],
      [{ subject: 'Valid subject', description: 'Valid description that is definitely longer than twenty characters.', category: 'nope' }, 'invalid category'],
      [{ subject: 'x'.repeat(201), description: 'Valid description that is definitely longer than twenty characters.' }, 'long subject'],
      [{ subject: { $ne: null }, description: 'Valid description that is definitely longer than twenty characters.' }, 'nosql subject'],
      [{ subject: 'Valid subject', description: 'x'.repeat(5001) }, 'long description'],
    ];
    for (const [payload, label] of cases) {
      assertError(await citizen.post('/api/v1/grievances', payload), 422, 'VALIDATION_ERROR', label);
    }
  });

  it('validates workflow payloads', async () => {
    assertError(
      await clerk.post(`/api/v1/grievances/${grievanceId}/verify`, {
        department: fixtures.departments.a.id,
        priority: 'CRITICAL',
      }),
      422,
      'VALIDATION_ERROR',
      'verify invalid priority',
    );
    assertError(
      await clerk.post(`/api/v1/grievances/${grievanceId}/verify`, { department: 'invalid' }),
      422,
      'VALIDATION_ERROR',
      'verify invalid department',
    );
    assertError(
      await citizen.post(`/api/v1/grievances/${grievanceId}/reopen-request`, { reason: 'short' }),
      422,
      'VALIDATION_ERROR',
      'short reopen reason',
    );
  });

  it('validates file and application payloads', async () => {
    assertError(await clerk.post('/api/v1/files', { subject: 'ab' }), 422, 'VALIDATION_ERROR', 'short file subject');
    assertError(
      await clerk.post('/api/v1/files', { subject: 'Valid file subject', confidentiality: 'TOP_SECRET' }),
      422,
      'VALIDATION_ERROR',
      'invalid confidentiality',
    );
    assertError(
      await clerk.post('/api/v1/files', { subject: 'Valid file subject', retentionDays: 0 }),
      422,
      'VALIDATION_ERROR',
      'invalid retention',
    );
    assertError(await citizen.post('/api/v1/applications', { formData: {} }), 422, 'VALIDATION_ERROR', 'missing application type');
    assertError(await citizen.post('/api/v1/applications', { type: 'bad-id' }), 422, 'VALIDATION_ERROR', 'invalid application type');
  });

  it('returns 400 for malformed JSON and 413 for oversized bodies', async () => {
    const malformed = await fetch(`${BASE}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"identifier":',
    });
    const malformedBody = await malformed.json();
    assert.equal(malformed.status, 400, `malformed json: ${JSON.stringify(malformedBody)}`);
    assert.equal(malformedBody.error.code, 'INVALID_JSON');

    const oversized = await fetch(`${BASE}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identifier: 'a'.repeat(2_500_000), password: 'x' }),
    });
    const oversizedBody = await oversized.json();
    assert.equal(oversized.status, 413, `oversized body: ${JSON.stringify(oversizedBody)}`);
    assert.equal(oversizedBody.error.code, 'PAYLOAD_TOO_LARGE');
  });

  it('rejects document upload without files', async () => {
    const form = new FormData();
    form.set('entityType', 'GRIEVANCE');
    form.set('entityId', grievanceId);
    const response = await citizen.post('/api/v1/documents', form);
    assertError(response, 422, 'VALIDATION_ERROR', 'upload without file');
  });

  it('rejects invalid document entity filters', async () => {
    assertError(
      await citizen.get(`/api/v1/documents?entityType=UNKNOWN&entityId=${grievanceId}`),
      422,
      'VALIDATION_ERROR',
      'bad entity type',
    );
    assertError(
      await citizen.get('/api/v1/documents?entityType=GRIEVANCE&entityId=nope'),
      422,
      'VALIDATION_ERROR',
      'bad entity id',
    );
  });

  it('returns a consistent error envelope for every failure', async () => {
    const responses = [
      await citizen.get('/api/v1/grievances/nope'),
      await citizen.post('/api/v1/grievances', {}),
      await citizen.get('/api/v1/admin/users'),
    ];
    for (const response of responses) {
      assert.equal(response.body.success, false);
      assert.equal(typeof response.body.error.code, 'string');
      assert.equal(typeof response.body.error.message, 'string');
      assert.equal(typeof response.body.requestId, 'string');
    }
  });
});
