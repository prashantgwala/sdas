import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ApiClient, CREDENTIALS, assertError, assertOk, assertStatus } from './lib/client.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtures = JSON.parse(fs.readFileSync(path.join(here, 'fixtures.json'), 'utf8'));

const citizen = new ApiClient('citizen');
const clerk = new ApiClient('clerk');
const head = new ApiClient('dept-head');
const officer = new ApiClient('officer');
const admin = new ApiClient('admin');

const deptA = fixtures.departments.a.id;
const officerId = fixtures.users.officer.id;
let typeId;

const formData = {
  applicantName: 'QA Applicant',
  purpose: 'Workflow verification',
};

async function createApplication(form = formData) {
  const response = await citizen.post('/api/v1/applications', { type: typeId, formData: form });
  assertStatus(response, 201, 'create application');
  return response.body.data;
}

async function verifyDocuments(id, provided, assignOfficer) {
  const response = await clerk.post(`/api/v1/applications/${id}/verify`, {
    checklist: [{ key: 'siteplan', label: 'Approved site plan', provided, verified: provided }],
    ...(assignOfficer ? { assignOfficer } : {}),
  });
  assertOk(response, 'verify application');
  return response.body.data;
}

async function detail(client, id) {
  const response = await client.get(`/api/v1/applications/${id}`);
  assertOk(response, 'application detail');
  return response.body.data;
}

before(async () => {
  await admin.login(CREDENTIALS.superAdmin.identifier, CREDENTIALS.superAdmin.password);
  await citizen.login(CREDENTIALS.citizen.identifier, CREDENTIALS.citizen.password);
  await clerk.login(CREDENTIALS.clerk.identifier, CREDENTIALS.clerk.password);
  await head.login(CREDENTIALS.deptHead.identifier, CREDENTIALS.deptHead.password);
  await officer.login(CREDENTIALS.officer.identifier, CREDENTIALS.officer.password);

  const created = await admin.post('/api/v1/admin/application-types', {
    name: `QA Workflow Permit ${Date.now()}`.slice(0, 180),
    code: `QAW${String(Date.now()).slice(-7)}`,
    department: deptA,
    description: 'Application type created by the QA automation suite.',
    requiredDocuments: [{ key: 'siteplan', label: 'Approved site plan', required: true }],
    formFieldSchema: {
      fields: [{ key: 'applicantName', label: 'Applicant name', type: 'text', required: true }],
    },
  });
  assertStatus(created, 201, 'create application type');
  typeId = created.body.data._id;
});

describe('Application workflow - end to end', () => {
  it('verifies documents, reviews and approves an application', async () => {
    const types = await citizen.get('/api/v1/applications/types');
    assertOk(types, 'application types');
    assert.ok(types.body.data.some((item) => item._id === typeId));

    const application = await createApplication();
    assert.equal(application.status, 'SUBMITTED');
    assert.equal(String(application.department), deptA);
    assert.equal(application.duplicateWarning, false);

    const completeness = await citizen.get(`/api/v1/applications/${application._id}/completeness`);
    assertOk(completeness, 'completeness');
    assert.ok(completeness.body.data.completeness < 100);
    assert.ok(completeness.body.data.missingDocuments.some((item) => item.key === 'siteplan'));

    const pending = await verifyDocuments(application._id, false);
    assert.equal(pending.status, 'DOCUMENT_PENDING');
    assert.ok(pending.missingDocuments.includes('Approved site plan'));

    const verified = await verifyDocuments(application._id, true, officerId);
    assert.equal(verified.status, 'UNDER_REVIEW');
    assert.equal(verified.missingDocuments.length, 0);
    assert.equal(String(verified.assignedOfficer), officerId);

    const assigned = await head.post(`/api/v1/applications/${application._id}/assign`, {
      officerId,
      remarks: 'Assigned for departmental review',
    });
    assertOk(assigned, 'assign application');
    assert.equal(String(assigned.body.data.assignedOfficer), officerId);

    const review = await officer.post(`/api/v1/applications/${application._id}/review`, {
      reviewNotes: 'All documents verified and the request is recommended for approval.',
    });
    assertOk(review, 'review application');
    assert.equal(review.body.data.status, 'PENDING_DECISION');

    const approved = await head.post(`/api/v1/applications/${application._id}/decision`, {
      outcome: 'APPROVED',
      reason: 'Approved after verifying the site plan against the application.',
    });
    assertOk(approved, 'approve application');
    assert.equal(approved.body.data.status, 'APPROVED');
    assert.equal(approved.body.data.sla.status, 'COMPLETED');

    const own = await detail(citizen, application._id);
    assert.equal(own.status, 'APPROVED');
  });

  it('rejects an application with reasons and closes another', async () => {
    const rejected = await createApplication();
    await verifyDocuments(rejected._id, true);
    await officer.post(`/api/v1/applications/${rejected._id}/review`, {
      reviewNotes: 'Site plan does not match the stated purpose.',
    });
    const decision = await head.post(`/api/v1/applications/${rejected._id}/decision`, {
      outcome: 'REJECTED',
      reason: 'The submitted site plan does not match the declared purpose.',
    });
    assertOk(decision, 'reject application');
    assert.equal(decision.body.data.status, 'REJECTED');

    const closed = await createApplication();
    await verifyDocuments(closed._id, true);
    const closeDecision = await head.post(`/api/v1/applications/${closed._id}/decision`, {
      outcome: 'CLOSED',
      reason: 'Withdrawn by the applicant during processing.',
    });
    assertOk(closeDecision, 'close application');
    assert.equal(closeDecision.body.data.status, 'CLOSED');
  });

  it('flags duplicate recent applications of the same type', async () => {
    const duplicate = await createApplication();
    assert.equal(duplicate.duplicateWarning, true);
    assert.ok(duplicate.duplicateOf);
  });
});

describe('Application workflow - guard rails', () => {
  let id;

  before(async () => {
    const application = await createApplication();
    id = application._id;
  });

  it('rejects decisions and reviews at the wrong stage', async () => {
    assertError(
      await head.post(`/api/v1/applications/${id}/decision`, {
        outcome: 'APPROVED',
        reason: 'Premature decision attempt',
      }),
      409,
      'INVALID_STATUS',
      'decision before verification',
    );
    assertError(
      await officer.post(`/api/v1/applications/${id}/review`, {
        reviewNotes: 'Premature review attempt before verification.',
      }),
      409,
      'INVALID_STATUS',
      'review before verification',
    );
  });

  it('rejects review by a citizen', async () => {
    await verifyDocuments(id, true);
    assertError(
      await citizen.post(`/api/v1/applications/${id}/review`, {
        reviewNotes: 'Citizen must not review their own application.',
      }),
      403,
      'FORBIDDEN_PERMISSION',
      'citizen review',
    );
  });

  it('rejects assignment to an officer outside the department', async () => {
    assertError(
      await head.post(`/api/v1/applications/${id}/assign`, {
        officerId: fixtures.users.officerOtherDept.id,
      }),
      422,
      'INVALID_OFFICER',
      'cross department assign',
    );
  });

  it('hides the application from other departments', async () => {
    const outsider = new ApiClient('outsider');
    await outsider.login(CREDENTIALS.officerOtherDept.identifier, CREDENTIALS.officerOtherDept.password);
    assertError(await outsider.get(`/api/v1/applications/${id}`), 403, 'FORBIDDEN_SCOPE', 'foreign dept detail');
    assertError(
      await outsider.get(`/api/v1/applications/${id}/completeness`),
      403,
      'FORBIDDEN_SCOPE',
      'foreign dept completeness',
    );
  });
});
