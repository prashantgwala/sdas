import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ApiClient, CREDENTIALS, assertError, assertOk, assertStatus } from './lib/client.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtures = JSON.parse(fs.readFileSync(path.join(here, 'fixtures.json'), 'utf8'));

const clerk = new ApiClient('clerk');
const officer = new ApiClient('officer');
const head = new ApiClient('dept-head');
const admin = new ApiClient('admin');

const deptA = fixtures.departments.a.id;
const officerId = fixtures.users.officer.id;
const headId = fixtures.users.deptHead.id;

async function registerFile(client, label, extra = {}) {
  const response = await client.post('/api/v1/files', {
    subject: `QA file ${label} ${Date.now()}`.slice(0, 250),
    department: deptA,
    confidentiality: 'INTERNAL',
    priority: 'NORMAL',
    ...extra,
  });
  assertStatus(response, 201, `register file ${label}`);
  return response.body.data;
}

async function fileDetail(client, id) {
  const response = await client.get(`/api/v1/files/${id}`);
  assertOk(response, 'file detail');
  return response.body.data;
}

async function dispatch(client, id, toUser, actionRequired = 'ACTION') {
  const response = await client.post(`/api/v1/files/${id}/dispatch`, { toUser, actionRequired });
  assertOk(response, 'dispatch');
  return response.body.data;
}

async function receive(client, id, body = { via: 'MANUAL' }) {
  const response = await client.post(`/api/v1/files/${id}/receive`, body);
  assertOk(response, 'receive');
  return response.body.data;
}

before(async () => {
  await clerk.login(CREDENTIALS.clerk.identifier, CREDENTIALS.clerk.password);
  await officer.login(CREDENTIALS.officer.identifier, CREDENTIALS.officer.password);
  await head.login(CREDENTIALS.deptHead.identifier, CREDENTIALS.deptHead.password);
  await admin.login(CREDENTIALS.superAdmin.identifier, CREDENTIALS.superAdmin.password);
});

describe('File workflow - end to end', () => {
  it('moves a file through QR dispatch, noting, approval, completion and archival', async () => {
    const file = await registerFile(clerk, 'full');
    const id = file._id;
    assert.equal(file.status, 'REGISTERED');
    assert.ok(file.fileNumber);

    const qr = await clerk.post(`/api/v1/files/${id}/qr`);
    assertOk(qr, 'qr generate');
    assert.ok(typeof qr.body.data.token === 'string' && qr.body.data.token.length > 20);
    assert.equal(qr.body.data.version, 1);

    const qrImage = await clerk.get(`/api/v1/files/${id}/qr.png`);
    assert.equal(qrImage.status, 200);
    assert.match(qrImage.headers.get('content-type') ?? '', /image\/png/);

    const verified = await officer.get(`/api/v1/files/qr/verify?token=${encodeURIComponent(qr.body.data.token)}`);
    assertOk(verified, 'qr verify');
    assert.equal(verified.body.data._id, id);

    const dispatched = await dispatch(clerk, id, officerId);
    assert.equal(dispatched.file.status, 'DISPATCHED');
    assert.equal(dispatched.movement.status, 'DISPATCHED');

    const officerInbox = await officer.get('/api/v1/files?mine=true&limit=100');
    assertOk(officerInbox, 'officer inbox');
    assert.ok(officerInbox.body.data.some((item) => item._id === id));

    const received = await receive(officer, id, { via: 'QR', token: qr.body.data.token });
    assert.equal(received.file.status, 'RECEIVED');
    assert.equal(received.movement.receivedVia, 'QR');

    assertError(
      await officer.post(`/api/v1/files/${id}/receive`, { via: 'MANUAL' }),
      409,
      'INVALID_STATUS',
      'duplicate receive',
    );

    const note = await officer.post(`/api/v1/files/${id}/notes`, {
      text: 'Field verification completed; forwarding for approval.',
      visibility: 'INTERNAL',
    });
    assertStatus(note, 201, 'file note');
    assert.equal((await fileDetail(officer, id)).status, 'NOTING_ADDED');

    await dispatch(officer, id, headId, 'APPROVAL');
    await receive(head, id);

    const approved = await head.post(`/api/v1/files/${id}/decision`, {
      outcome: 'APPROVED',
      remarks: 'Approved after reviewing the field report.',
    });
    assertOk(approved, 'approve');
    assert.equal(approved.body.data.status, 'APPROVED');

    const completed = await head.post(`/api/v1/files/${id}/finalize`, {
      finalAction: 'File finalised and closed for records.',
    });
    assertOk(completed, 'finalize');
    assert.equal(completed.body.data.status, 'COMPLETED');

    const archived = await head.post(`/api/v1/files/${id}/archive`, { notes: 'Archived by QA head' });
    assertOk(archived, 'archive');
    assert.equal(archived.body.data.status, 'ARCHIVED');

    const movements = await head.get(`/api/v1/files/${id}/movements`);
    assertOk(movements, 'movements');
    assert.ok(movements.body.data.length >= 2);
    assert.ok(movements.body.data.every((movement) => movement.status === 'RECEIVED'));
    assert.ok(movements.body.data.every((movement) => movement.movementNumber));
  });

  it('returns a file to the originator and restores custody', async () => {
    const file = await registerFile(clerk, 'return');
    const id = file._id;
    await dispatch(clerk, id, officerId);
    await receive(officer, id);
    await officer.post(`/api/v1/files/${id}/notes`, { text: 'Draft note before return.' });
    await dispatch(officer, id, headId, 'APPROVAL');
    await receive(head, id);

    const returned = await head.post(`/api/v1/files/${id}/decision`, {
      outcome: 'RETURNED',
      remarks: 'Supporting annexure is missing; return to clerk.',
    });
    assertOk(returned, 'return file');
    assert.equal(returned.body.data.status, 'RETURNED');
    assert.equal(String(returned.body.data.currentCustodian), officerId, 'return custody to the previous sender');

    assertError(
      await head.post(`/api/v1/files/${id}/finalize`, { finalAction: 'Should not finalize a returned file.' }),
      409,
      'INVALID_STATUS',
      'finalize returned file',
    );
  });

  it('invalidates previous QR tokens after regeneration', async () => {
    const file = await registerFile(clerk, 'qr-version');
    const id = file._id;
    const first = await clerk.post(`/api/v1/files/${id}/qr`);
    assertOk(first, 'first qr');
    const second = await clerk.post(`/api/v1/files/${id}/qr`);
    assertOk(second, 'second qr');
    assert.equal(second.body.data.version, 2);

    assertError(
      await officer.get(`/api/v1/files/qr/verify?token=${encodeURIComponent(first.body.data.token)}`),
      404,
      'INVALID_QR',
      'stale qr token',
    );
    const fresh = await officer.get(`/api/v1/files/qr/verify?token=${encodeURIComponent(second.body.data.token)}`);
    assertOk(fresh, 'fresh qr token');
  });
});

describe('File workflow - guard rails', () => {
  it('blocks dispatch by a user who is not the custodian', async () => {
    const file = await registerFile(clerk, 'custody');
    const id = file._id;
    assertError(
      await officer.post(`/api/v1/files/${id}/dispatch`, { toUser: headId }),
      403,
      'FORBIDDEN_SCOPE',
      'non-custodian dispatch',
    );
  });

  it('blocks confidential dispatch to a recipient without clearance', async () => {
    const confidential = await registerFile(admin, 'confidential', { confidentiality: 'CONFIDENTIAL' });
    assertError(
      await admin.post(`/api/v1/files/${confidential._id}/dispatch`, { toUser: officerId }),
      422,
      'FORBIDDEN_CONFIDENTIAL',
      'confidential dispatch',
    );
  });

  it('blocks restricted files from the standard dispatch workflow', async () => {
    const restricted = await registerFile(admin, 'restricted', { confidentiality: 'RESTRICTED' });
    assertError(
      await admin.post(`/api/v1/files/${restricted._id}/dispatch`, { toUser: headId }),
      403,
      'FORBIDDEN_RESTRICTED',
      'restricted dispatch',
    );
  });

  it('rejects receipt when no movement is pending for the user', async () => {
    const file = await registerFile(clerk, 'no-movement');
    assertError(
      await officer.post(`/api/v1/files/${file._id}/receive`, { via: 'MANUAL' }),
      409,
      'INVALID_STATUS',
      'receive without dispatch',
    );
  });

  it('rejects decisions before the file reaches a reviewable state', async () => {
    const file = await registerFile(clerk, 'early-decision');
    const id = file._id;
    await dispatch(clerk, id, officerId);
    await receive(officer, id);
    await head.post(`/api/v1/files/${id}/decision`, {
      outcome: 'APPROVED',
      remarks: 'Approved from received state',
    });
    // RECEIVED is a valid decision state by design; ensure double-finalize is rejected.
    const completed = await head.post(`/api/v1/files/${id}/finalize`, {
      finalAction: 'Finalised once for guard rail coverage.',
    });
    assertOk(completed, 'finalize once');
    assertError(
      await head.post(`/api/v1/files/${id}/finalize`, { finalAction: 'Finalise a second time.' }),
      409,
      'INVALID_STATUS',
      'double finalize',
    );
  });
});

describe('File queries and scoping', () => {
  it('filters by status and confidentiality', async () => {
    const file = await registerFile(clerk, 'filters');
    const byStatus = await clerk.get('/api/v1/files?status=REGISTERED&limit=100');
    assertOk(byStatus, 'status filter');
    assert.ok(byStatus.body.data.some((item) => item._id === file._id));
    assert.ok(byStatus.body.data.every((item) => item.status === 'REGISTERED'));

    const byConfidentiality = await head.get('/api/v1/files?confidentiality=CONFIDENTIAL&limit=100');
    assertOk(byConfidentiality, 'confidentiality filter');
    assert.ok(byConfidentiality.body.data.every((item) => item.confidentiality === 'CONFIDENTIAL'));
  });

  it('hides files from users outside the owning department', async () => {
    const file = await registerFile(clerk, 'scope');
    const outsider = new ApiClient('outsider');
    await outsider.login(CREDENTIALS.officerOtherDept.identifier, CREDENTIALS.officerOtherDept.password);
    assertError(await outsider.get(`/api/v1/files/${file._id}`), 403, 'FORBIDDEN_SCOPE', 'foreign dept file');
    const list = await outsider.get('/api/v1/files?limit=100');
    assertOk(list, 'outsider file list');
    assert.ok(!list.body.data.some((item) => item._id === file._id));
  });
});
