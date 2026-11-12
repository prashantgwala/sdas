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

const deptA = fixtures.departments.a.id;
const category = fixtures.grievanceCategory._id;
const officerId = fixtures.users.officer.id;

async function newGrievance(label) {
  const response = await citizen.post('/api/v1/grievances', {
    subject: `QA workflow ${label} ${Date.now()}`.slice(0, 200),
    description: `Automated QA workflow coverage for ${label}. This complaint description is intentionally long enough to satisfy validation.`,
    category,
  });
  assertStatus(response, 201, `create grievance ${label}`);
  return response.body.data;
}

async function statusOf(client, id) {
  const response = await client.get(`/api/v1/grievances/${id}`);
  assertOk(response, 'grievance detail');
  return response.body.data;
}

async function timelineOf(client, id) {
  const response = await client.get(`/api/v1/grievances/${id}/timeline`);
  assertOk(response, 'grievance timeline');
  return response.body.data;
}

before(async () => {
  await citizen.login(CREDENTIALS.citizen.identifier, CREDENTIALS.citizen.password);
  await clerk.login(CREDENTIALS.clerk.identifier, CREDENTIALS.clerk.password);
  await head.login(CREDENTIALS.deptHead.identifier, CREDENTIALS.deptHead.password);
  await officer.login(CREDENTIALS.officer.identifier, CREDENTIALS.officer.password);
});

describe('Grievance workflow - end to end', () => {
  it('drives a grievance through return, resolve, reopen and close', async () => {
    const created = await newGrievance('full');
    assert.equal(created.status, 'SUBMITTED');
    const id = created._id;

    const verified = await clerk.post(`/api/v1/grievances/${id}/verify`, { notes: 'Verified by QA clerk' });
    assertOk(verified, 'verify');
    assert.equal(verified.body.data.status, 'RECEIVED');
    assert.equal(String(verified.body.data.department), deptA);

    const routed = await clerk.post(`/api/v1/grievances/${id}/route`, {
      department: deptA,
      remarks: 'Route to disaster cell',
    });
    assertOk(routed, 'route');

    const assigned = await head.post(`/api/v1/grievances/${id}/assign`, {
      officerId,
      remarks: 'Assign for field inspection',
    });
    assertOk(assigned, 'assign');
    assert.equal(assigned.body.data.status, 'ASSIGNED');
    assert.equal(String(assigned.body.data.assignedOfficer), officerId);

    const acknowledged = await officer.post(`/api/v1/grievances/${id}/acknowledge`);
    assertOk(acknowledged, 'acknowledge');
    assert.equal(acknowledged.body.data.status, 'UNDER_INVESTIGATION');

    const action = await officer.post(`/api/v1/grievances/${id}/actions`, {
      type: 'EVIDENCE',
      text: 'Site inspection completed and photographs captured.',
    });
    assertStatus(action, 201, 'action');
    assert.equal(action.body.data.type, 'EVIDENCE');

    const firstResolution = await officer.post(`/api/v1/grievances/${id}/resolution`, {
      text: 'Relief material distributed and embankment repaired.',
    });
    assertOk(firstResolution, 'resolution');
    assert.equal(firstResolution.body.data.status, 'PENDING_APPROVAL');

    const returned = await head.post(`/api/v1/grievances/${id}/decision`, {
      outcome: 'RETURNED',
      reason: 'Attach the completion certificate before approval.',
    });
    assertOk(returned, 'return for correction');
    assert.equal(returned.body.data.status, 'UNDER_INVESTIGATION');

    const secondResolution = await officer.post(`/api/v1/grievances/${id}/resolution`, {
      text: 'Completion certificate attached and relief verified.',
    });
    assertOk(secondResolution, 'second resolution');

    const resolved = await head.post(`/api/v1/grievances/${id}/decision`, {
      outcome: 'RESOLVED',
      reason: 'Work verified against the completion certificate.',
    });
    assertOk(resolved, 'resolve');
    assert.equal(resolved.body.data.status, 'RESOLVED');

    const reopenRequested = await citizen.post(`/api/v1/grievances/${id}/reopen-request`, {
      reason: 'The repair has cracked again after the first rainfall.',
    });
    assertOk(reopenRequested, 'reopen request');
    assert.equal(reopenRequested.body.data.reopenRequest.status, 'PENDING');

    const queue = await head.get('/api/v1/grievances/reopen-queue');
    assertOk(queue, 'reopen queue');
    assert.ok(queue.body.data.some((item) => item._id === id));

    const reopened = await head.post(`/api/v1/grievances/${id}/reopen-review`, {
      approve: true,
      decisionNotes: 'Reopening accepted for re-inspection.',
    });
    assertOk(reopened, 'reopen review');
    assert.equal(reopened.body.data.status, 'REOPENED');

    await head.post(`/api/v1/grievances/${id}/assign`, { officerId });
    await officer.post(`/api/v1/grievances/${id}/acknowledge`);
    await officer.post(`/api/v1/grievances/${id}/resolution`, {
      text: 'Re-inspection completed and the repair re-executed.',
    });
    const finalDecision = await head.post(`/api/v1/grievances/${id}/decision`, {
      outcome: 'RESOLVED',
      reason: 'Re-inspection confirms the defect is fixed.',
    });
    assertOk(finalDecision, 'final decision');

    const closed = await head.post(`/api/v1/grievances/${id}/close`, {
      reason: 'Citizen confirmed the grievance is fully addressed.',
    });
    assertOk(closed, 'close');
    assert.equal(closed.body.data.status, 'CLOSED');

    const internalTimeline = await timelineOf(head, id);
    const actions = internalTimeline.map((entry) => entry.action);
    for (const expected of ['VERIFIED', 'ROUTED', 'ASSIGNED', 'ACKNOWLEDGED', 'EVIDENCE', 'RESOLUTION_SUBMITTED', 'DECISION_RETURNED', 'DECISION_RESOLVED', 'REOPEN_REQUESTED', 'REOPENED', 'CLOSED']) {
      assert.ok(actions.includes(expected), `timeline missing ${expected}: ${actions.join(', ')}`);
    }

    const citizenTimeline = await timelineOf(citizen, id);
    assert.ok(citizenTimeline.length > 0, 'citizen timeline should be visible');
    assert.ok(
      citizenTimeline.every((entry) => entry.visibility !== 'INTERNAL'),
      'citizen must not see internal-only timeline entries',
    );
    assert.ok(
      !citizenTimeline.some((entry) => entry.action === 'VERIFIED'),
      'internal verification notes must not leak to the citizen timeline',
    );
    const detail = await statusOf(citizen, id);
    assert.equal(detail.sla.status, 'COMPLETED');
  });

  it('records rejection and closes the grievance', async () => {
    const created = await newGrievance('reject');
    const id = created._id;
    await clerk.post(`/api/v1/grievances/${id}/verify`, {});
    await clerk.post(`/api/v1/grievances/${id}/route`, { department: deptA });
    await head.post(`/api/v1/grievances/${id}/assign`, { officerId });
    await officer.post(`/api/v1/grievances/${id}/acknowledge`);
    await officer.post(`/api/v1/grievances/${id}/resolution`, {
      text: 'Investigated and no administrative action is possible.',
    });
    const rejected = await head.post(`/api/v1/grievances/${id}/decision`, {
      outcome: 'REJECTED',
      reason: 'The subject matter falls outside departmental jurisdiction.',
    });
    assertOk(rejected, 'reject');
    assert.equal(rejected.body.data.status, 'REJECTED');

    const closed = await head.post(`/api/v1/grievances/${id}/close`, {
      reason: 'Rejection communicated to the complainant.',
    });
    assertOk(closed, 'close rejected');
    assert.equal(closed.body.data.status, 'CLOSED');
  });

  it('escalates with increasing levels and hides closed grievances from escalation', async () => {
    const created = await newGrievance('escalate');
    const id = created._id;
    await clerk.post(`/api/v1/grievances/${id}/verify`, {});
    await clerk.post(`/api/v1/grievances/${id}/route`, { department: deptA });
    await head.post(`/api/v1/grievances/${id}/assign`, { officerId });

    const first = await head.post(`/api/v1/grievances/${id}/escalate`, { reason: 'SLA at risk' });
    assertOk(first, 'escalate level 1');
    assert.equal(first.body.data.sla.escalationLevel, 1);
    const second = await head.post(`/api/v1/grievances/${id}/escalate`, { reason: 'No progress after reminder' });
    assertOk(second, 'escalate level 2');
    assert.equal(second.body.data.sla.escalationLevel, 2);

    await officer.post(`/api/v1/grievances/${id}/acknowledge`);
    await officer.post(`/api/v1/grievances/${id}/resolution`, { text: 'Resolved after escalation.' });
    await head.post(`/api/v1/grievances/${id}/decision`, { outcome: 'RESOLVED', reason: 'Resolved after escalation.' });
    const closed = await head.post(`/api/v1/grievances/${id}/close`, { reason: 'Closed after resolution.' });
    assertOk(closed, 'close escalated');

    assertError(
      await head.post(`/api/v1/grievances/${id}/escalate`, { reason: 'Should not escalate closed' }),
      409,
      'INVALID_STATUS',
      'escalate closed',
    );
  });
});

describe('Grievance workflow - guard rails', () => {
  let id;

  before(async () => {
    const created = await newGrievance('guards');
    id = created._id;
    await clerk.post(`/api/v1/grievances/${id}/verify`, {});
    await clerk.post(`/api/v1/grievances/${id}/route`, { department: deptA });
  });

  it('rejects decisions before a resolution exists', async () => {
    assertError(
      await head.post(`/api/v1/grievances/${id}/decision`, {
        outcome: 'RESOLVED',
        reason: 'Premature approval attempt',
      }),
      409,
      'INVALID_STATUS',
      'decision before resolution',
    );
  });

  it('rejects closing a grievance that is not resolved', async () => {
    assertError(
      await head.post(`/api/v1/grievances/${id}/close`, { reason: 'Premature close attempt' }),
      409,
      'INVALID_STATUS',
      'close early',
    );
  });

  it('rejects re-verification once assignment has started', async () => {
    await head.post(`/api/v1/grievances/${id}/assign`, { officerId });
    assertError(
      await clerk.post(`/api/v1/grievances/${id}/verify`, {}),
      409,
      'INVALID_STATUS',
      'duplicate verify',
    );
  });

  it('rejects actions from the wrong role or custodian', async () => {
    assertError(
      await citizen.post(`/api/v1/grievances/${id}/decision`, {
        outcome: 'CLOSED',
        reason: 'Citizen cannot decide',
      }),
      403,
      'FORBIDDEN_PERMISSION',
      'citizen decision',
    );
    assertError(
      await officer.post(`/api/v1/grievances/${id}/decision`, {
        outcome: 'RESOLVED',
        reason: 'Officer cannot decide',
      }),
      403,
      'FORBIDDEN_PERMISSION',
      'officer decision',
    );
    assertError(
      await clerk.post(`/api/v1/grievances/${id}/acknowledge`),
      403,
      'FORBIDDEN_PERMISSION',
      'clerk acknowledge',
    );
  });

  it('rejects acknowledgement by an officer other than the assignee', async () => {
    const other = new ApiClient('officer-other');
    await other.login(CREDENTIALS.officerOtherDept.identifier, CREDENTIALS.officerOtherDept.password);
    assertError(
      await other.post(`/api/v1/grievances/${id}/acknowledge`),
      403,
      'FORBIDDEN_SCOPE',
      'other officer acknowledge',
    );
  });

  it('rejects reopen requests and reviews when not eligible', async () => {
    assertError(
      await citizen.post(`/api/v1/grievances/${id}/reopen-request`, {
        reason: 'Cannot reopen a grievance still in progress',
      }),
      409,
      'INVALID_STATUS',
      'reopen in progress',
    );
    assertError(
      await head.post(`/api/v1/grievances/${id}/reopen-review`, { approve: true }),
      409,
      'INVALID_STATUS',
      'reopen review without request',
    );
  });
});

describe('Grievance queries and scoping', () => {
  let id;

  before(async () => {
    const created = await newGrievance('query');
    id = created._id;
    await clerk.post(`/api/v1/grievances/${id}/verify`, {});
    await clerk.post(`/api/v1/grievances/${id}/route`, { department: deptA });
    await head.post(`/api/v1/grievances/${id}/assign`, { officerId });
  });

  it('filters by status without returning other statuses', async () => {
    const response = await clerk.get('/api/v1/grievances?status=ASSIGNED&limit=100');
    assertOk(response, 'status filter');
    assert.ok(response.body.data.length > 0);
    assert.ok(response.body.data.every((item) => item.status === 'ASSIGNED'));
  });

  it('scopes mine filters to the caller', async () => {
    const officerList = await officer.get('/api/v1/grievances?mine=true&limit=100');
    assertOk(officerList, 'officer mine');
    assert.ok(officerList.body.data.some((item) => item._id === id));
    assert.ok(officerList.body.data.every((item) => String(item.assignedOfficer?._id ?? item.assignedOfficer) === officerId));

    const citizenList = await citizen.get('/api/v1/grievances?mine=true&limit=100');
    assertOk(citizenList, 'citizen mine');
    assert.ok(citizenList.body.data.every((item) => String(item.citizen) === fixtures.users.citizen.id));
  });

  it('exposes timeline and actions to authorised readers only', async () => {
    const actions = await officer.post(`/api/v1/grievances/${id}/actions`, {
      type: 'INTERNAL_NOTE',
      text: 'QA internal note',
      visibility: 'INTERNAL',
    });
    assertStatus(actions, 201, 'add internal note');

    const list = await officer.get(`/api/v1/grievances/${id}/actions`);
    assertOk(list, 'grievance actions');
    assert.ok(list.body.data.some((item) => item.text === 'QA internal note'));

    const outsider = new ApiClient('outsider');
    await outsider.login(CREDENTIALS.officerOtherDept.identifier, CREDENTIALS.officerOtherDept.password);
    assertError(await outsider.get(`/api/v1/grievances/${id}`), 403, 'FORBIDDEN_SCOPE', 'other dept detail');
    assertError(await outsider.get(`/api/v1/grievances/${id}/timeline`), 403, 'FORBIDDEN_SCOPE', 'other dept timeline');
  });
});
