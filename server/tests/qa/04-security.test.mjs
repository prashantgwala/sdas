import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ApiClient, BASE, CREDENTIALS, assertError, assertOk, assertStatus } from './lib/client.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtures = JSON.parse(fs.readFileSync(path.join(here, 'fixtures.json'), 'utf8'));

const citizen = new ApiClient('citizen');
const officer = new ApiClient('officer');
const deptHead = new ApiClient('dept-head');
const clerk = new ApiClient('clerk');
const admin = new ApiClient('admin');
let grievanceId;
let outsider;
let uploadedDocumentId;

const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41,
  0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
  0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
]);

function pngBlob(name = 'qa-proof.png', content = PNG) {
  return new File([content], name, { type: 'image/png' });
}

async function upload(target, entityType, entityId, file, extra = {}) {
  const form = new FormData();
  form.set('entityType', entityType);
  form.set('entityId', entityId);
  for (const [key, value] of Object.entries(extra)) form.set(key, value);
  if (file) form.append('files', file);
  return target.post('/api/v1/documents', form);
}

before(async () => {
  await Promise.all([
    citizen.login(CREDENTIALS.citizen.identifier, CREDENTIALS.citizen.password),
    officer.login(CREDENTIALS.officer.identifier, CREDENTIALS.officer.password),
    deptHead.login(CREDENTIALS.deptHead.identifier, CREDENTIALS.deptHead.password),
    clerk.login(CREDENTIALS.clerk.identifier, CREDENTIALS.clerk.password),
    admin.login(CREDENTIALS.superAdmin.identifier, CREDENTIALS.superAdmin.password),
  ]);
  const created = await citizen.post('/api/v1/grievances', {
    subject: 'QA security fixture grievance',
    description: 'Fixture used to verify document security controls without touching production data.',
    category: fixtures.grievanceCategory._id,
  });
  assertStatus(created, 201, 'security fixture');
  grievanceId = created.body.data._id;

  const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  outsider = new ApiClient('outsider');
  const registered = await outsider.post('/api/v1/auth/register', {
    name: 'QA Security Outsider',
    email: `qa.security.${stamp}@sdas.test`,
    mobile: `6${String(Math.floor(Math.random() * 1_000_000_000)).padStart(9, '0')}`,
    password: 'Outsider@123',
  });
  assertStatus(registered, 201, 'register security outsider');
});

describe('Security - document uploads', () => {
  it('accepts a valid image upload and hides storage internals', async () => {
    const response = await upload(citizen, 'GRIEVANCE', grievanceId, pngBlob());
    assertStatus(response, 201, `upload png: ${JSON.stringify(response.body)}`);
    assert.equal(response.body.data.length, 1);
    uploadedDocumentId = response.body.data[0].id;
    assert.equal(response.body.data[0].mimeType, 'image/png');
    assert.ok(!('storagePath' in response.body.data[0]));
    assert.ok(!('storedName' in response.body.data[0]));
  });

  it('serves downloads only to authorised users with safe headers', async () => {
    assertError(
      await new ApiClient('anon').get(`/api/v1/documents/${uploadedDocumentId}/download`),
      401,
      'UNAUTHORIZED',
      'download without session',
    );
    assertError(
      await outsider.get(`/api/v1/documents/${uploadedDocumentId}/download`),
      403,
      'FORBIDDEN_SCOPE',
      'download as outsider',
    );
    const owner = await citizen.get(`/api/v1/documents/${uploadedDocumentId}/download`);
    assert.equal(owner.status, 200, `owner download: ${JSON.stringify(owner.body)}`);
    assert.match(owner.headers.get('content-disposition') ?? '', /attachment/i);
    assert.equal(owner.headers.get('x-content-type-options'), 'nosniff');
  });

  it('rejects MIME spoofing and unsupported file types', async () => {
    const spoofed = await upload(
      citizen,
      'GRIEVANCE',
      grievanceId,
      new File([Buffer.from('this is not an image')], 'fake.png', { type: 'image/png' }),
    );
    assertError(spoofed, 415, 'UNSUPPORTED_FILE_TYPE', 'mime spoof');

    const zip = await upload(
      citizen,
      'GRIEVANCE',
      grievanceId,
      new File([Buffer.from('PK')], 'archive.zip', { type: 'application/zip' }),
    );
    assertError(zip, 415, 'UNSUPPORTED_FILE_TYPE', 'unsupported type');
  });

  it('enforces the upload size limit', async () => {
    const big = Buffer.concat([PNG, Buffer.alloc(11 * 1024 * 1024)]);
    const response = await upload(citizen, 'GRIEVANCE', grievanceId, pngBlob('big.png', big));
    assertError(response, 413, 'FILE_TOO_LARGE', 'oversized upload');
  });

  it('blocks uploads to another citizen grievance', async () => {
    const response = await upload(outsider, 'GRIEVANCE', grievanceId, pngBlob());
    assertError(response, 403, 'FORBIDDEN_SCOPE', 'cross-citizen upload');
  });

  it('sanitises traversal-style filenames and blocks foreign deletion', async () => {
    const response = await upload(citizen, 'GRIEVANCE', grievanceId, pngBlob('../../../evil.png'));
    assertStatus(response, 201, 'traversal filename upload');
    const created = response.body.data[0];
    assert.ok(!created.originalName.includes('..'), `original name kept traversal: ${created.originalName}`);

    assertError(
      await outsider.delete(`/api/v1/documents/${created.id}`),
      403,
      'FORBIDDEN_PERMISSION',
      'foreign delete',
    );
    assertOk(await citizen.delete(`/api/v1/documents/${created.id}`), 'owner delete');
    assertError(await citizen.get(`/api/v1/documents/${created.id}/download`), 404, 'NOT_FOUND', 'deleted download');
  });

  it('rejects uploads into restricted records and blocks restricted downloads', async () => {
    const restricted = await admin.post('/api/v1/files', {
      subject: 'QA restricted security file',
      department: fixtures.departments.a.id,
      confidentiality: 'RESTRICTED',
      priority: 'HIGH',
    });
    assertStatus(restricted, 201, 'restricted file');
    const fileId = restricted.body.data._id;

    const response = await upload(admin, 'FILE', fileId, pngBlob('restricted.png'));
    assertStatus(response, 201, 'restricted upload');
    const documentId = response.body.data[0].id;

    const download = await admin.get(`/api/v1/documents/${documentId}/download`);
    assertError(download, 403, 'FORBIDDEN_RESTRICTED', 'restricted download');
  });
});

describe('Security - access control and data exposure', () => {
  it('requires authentication on every module router', async () => {
    const anon = new ApiClient('anon');
    const routes = [
      '/api/v1/documents/mine',
      '/api/v1/files',
      '/api/v1/applications',
      '/api/v1/notifications',
      '/api/v1/dashboard',
      '/api/v1/admin/users',
      '/api/v1/feedback',
      '/api/v1/meetings',
      '/api/v1/tasks',
      '/api/v1/incidents',
      '/api/v1/weather-alerts',
      '/api/v1/roads',
      '/api/v1/chat/conversations',
      '/api/v1/helpdesk',
      '/api/v1/reports',
      '/api/v1/reference/catalogs',
      '/api/v1/reference/officers',
    ];
    for (const route of routes) {
      const response = await anon.get(route);
      assert.equal(response.status, 401, `anon ${route}: ${JSON.stringify(response.body)}`);
    }
  });

  it('does not expose credential material in list responses', async () => {
    const users = await admin.get('/api/v1/admin/users?limit=100');
    assertOk(users, 'admin users');
    const serialized = JSON.stringify(users.body);
    for (const forbidden of ['passwordHash', 'refreshTokenHash', 'tokenHash', 'otpHash']) {
      assert.ok(!serialized.includes(forbidden), `users list leaked ${forbidden}`);
    }

    const notifications = await citizen.get('/api/v1/notifications?limit=100');
    assertOk(notifications, 'notifications');
    assert.ok(!JSON.stringify(notifications.body).includes('passwordHash'));
  });

  it('returns no stack traces or internal details on errors', async () => {
    const response = await citizen.get('/api/v1/grievances/not-an-id');
    assert.equal(response.status, 422);
    const serialized = JSON.stringify(response.body);
    assert.ok(!serialized.includes('stack'));
    assert.ok(!serialized.includes('node_modules'));
    assert.ok(!serialized.toLowerCase().includes('mongodb://'));
  });

  it('sets defensive security headers and omits fingerprinting headers', async () => {
    const response = await fetch(`${BASE}/api/health`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('x-frame-options'), 'DENY');
    assert.ok(response.headers.get('content-security-policy'));
    assert.equal(response.headers.get('x-powered-by'), null);
  });

  it('allows configured origins and rejects foreign origins on preflight', async () => {
    const allowed = await fetch(`${BASE}/api/v1/grievances`, {
      method: 'OPTIONS',
      headers: {
        origin: 'http://localhost:3200',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type,x-csrf-token',
      },
    });
    assert.ok([200, 204].includes(allowed.status), `allowed preflight ${allowed.status}`);
    assert.equal(allowed.headers.get('access-control-allow-origin'), 'http://localhost:3200');

    const blocked = await fetch(`${BASE}/api/v1/grievances`, {
      method: 'OPTIONS',
      headers: { origin: 'http://evil.example', 'access-control-request-method': 'POST' },
    });
    assert.equal(blocked.status, 403);
  });

  it('stores untrusted text as data without executing markup', async () => {
    const payload = '<script>window.__qa_xss=1</script><img src=x onerror=alert(1)>';
    const created = await citizen.post('/api/v1/grievances', {
      subject: `XSS probe ${payload}`.slice(0, 200),
      description: `QA stored cross-site scripting probe. Payload: ${payload}`,
    });
    assertStatus(created, 201, 'xss probe grievance');
    const detail = await citizen.get(`/api/v1/grievances/${created.body.data._id}`);
    assertOk(detail, 'xss probe detail');
    assert.match(detail.headers.get('content-type') ?? '', /application\/json/);
    assert.equal(detail.body.data.subject.includes('<script>'), true);
  });

  it('confidential files are hidden from roles without clearance', async () => {
    const confidential = await admin.post('/api/v1/files', {
      subject: 'QA confidential clearance file',
      department: fixtures.departments.a.id,
      confidentiality: 'CONFIDENTIAL',
      priority: 'NORMAL',
    });
    assertStatus(confidential, 201, 'confidential file');
    const fileId = confidential.body.data._id;

    assertError(await officer.get(`/api/v1/files/${fileId}`), 403, 'FORBIDDEN_CONFIDENTIAL', 'officer confidential detail');
    assertOk(await deptHead.get(`/api/v1/files/${fileId}`), 'head confidential detail');
    const list = await officer.get('/api/v1/files?limit=100');
    assertOk(list, 'officer file list');
    assert.ok(!list.body.data.some((item) => item._id === fileId));

    assertError(
      await clerk.post('/api/v1/files', {
        subject: 'QA clerk confidential attempt',
        department: fixtures.departments.a.id,
        confidentiality: 'CONFIDENTIAL',
      }),
      403,
      'FORBIDDEN_CONFIDENTIAL',
      'clerk confidential create',
    );
    assertError(
      await clerk.post('/api/v1/files', {
        subject: 'QA clerk restricted attempt',
        department: fixtures.departments.a.id,
        confidentiality: 'RESTRICTED',
      }),
      403,
      'FORBIDDEN_RESTRICTED',
      'clerk restricted create',
    );
  });

  it('keeps restricted modules disabled and AI optional', async () => {
    const health = await fetch(`${BASE}/api/health`).then((response) => response.json());
    assert.equal(health.data.environment, 'test');

    const settings = await admin.get('/api/v1/admin/settings');
    assertOk(settings, 'settings list');
    const findSetting = (key) => settings.body.data.find((entry) => entry.key === key);
    const restricted = findSetting('restricted.moduleEnabled');
    assert.ok(restricted, 'restricted.moduleEnabled setting must exist');
    assert.equal(restricted.value, false, 'restricted module must default to disabled');
    const humanReview = findSetting('ai.requireHumanReview');
    assert.ok(humanReview, 'ai.requireHumanReview setting must exist');
    assert.equal(humanReview.value, true, 'AI suggestions must require human review');
    const email = findSetting('integrations.email');
    if (email) {
      const emailValue = email.value ?? {};
      assert.ok(!emailValue.enabled || emailValue.provider, 'email must not appear configured without a provider');
    }
  });
});
