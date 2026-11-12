import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ApiClient, CREDENTIALS, assertOk, assertStatus } from './lib/client.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtures = JSON.parse(fs.readFileSync(path.join(here, 'fixtures.json'), 'utf8'));
const MISSING_ID = '000000000000000000000000';

const clients = {};
const roles = {
  citizen: 'CITIZEN',
  clerk: 'CLERK',
  officer: 'OFFICER',
  deptHead: 'DEPARTMENT_HEAD',
  districtAdmin: 'DISTRICT_ADMIN',
  superAdmin: 'SUPER_ADMIN',
};

before(async () => {
  for (const [key, credentials] of Object.entries(CREDENTIALS)) {
    const client = new ApiClient(key);
    await client.login(credentials.identifier, credentials.password);
    clients[key] = client;
  }
});

async function expectStatus(client, method, route, expected, body, label) {
  const response = await client.request(method, route, { body });
  assert.equal(
    response.status,
    expected,
    `${label} (${roles[client.label] ?? client.label}) expected ${expected}, got ${response.status}: ${JSON.stringify(response.body)}`,
  );
  return response;
}

describe('RBAC - permission model', () => {
  it('assigns the documented default permissions to every role', () => {
    const expectations = {
      citizen: {
        has: ['dashboard.self', 'grievance.create', 'grievance.read.own', 'application.read.own', 'chatbot.use'],
        hasNot: ['grievance.read.dept', 'grievance.verify', 'file.register', 'user.read', 'grievance.approve.dept'],
      },
      clerk: {
        has: ['grievance.verify', 'grievance.classify', 'file.register', 'file.dispatch', 'application.verify'],
        hasNot: ['grievance.assign', 'grievance.approve.dept', 'application.decision.dept', 'user.read', 'file.read.confidential'],
      },
      officer: {
        has: ['grievance.investigate', 'grievance.act', 'grievance.resolve', 'application.review', 'file.note'],
        hasNot: ['grievance.verify', 'grievance.assign', 'grievance.approve.dept', 'file.approve.dept', 'user.read'],
      },
      deptHead: {
        has: ['grievance.assign', 'grievance.approve.dept', 'grievance.close', 'file.approve.dept', 'application.decision.dept', 'meeting.minutes.approve'],
        hasNot: ['grievance.verify', 'user.read', 'settings.manage', 'org.manage', 'weather.manage', 'role.permission.manage'],
      },
      districtAdmin: {
        has: ['grievance.read.district', 'grievance.monitor.district', 'grievance.approve.district', 'file.approve.district', 'user.read', 'audit.read', 'incident.resources', 'weather.manage'],
        hasNot: ['user.create', 'org.manage', 'settings.manage', 'role.permission.manage', 'config.grievance', 'grievance.verify'],
      },
      superAdmin: {
        has: ['user.create', 'org.manage', 'settings.manage', 'role.permission.manage', 'system.monitor', 'incident.close'],
        hasNot: [],
      },
    };

    for (const [key, expectation] of Object.entries(expectations)) {
      assert.equal(clients[key].user.role, roles[key], `${key} role`);
      for (const permission of expectation.has) {
        assert.ok(clients[key].permissions.includes(permission), `${roles[key]} missing ${permission}`);
      }
      for (const permission of expectation.hasNot) {
        assert.ok(!clients[key].permissions.includes(permission), `${roles[key]} should not have ${permission}`);
      }
    }
  });
});

describe('RBAC - endpoint enforcement', () => {
  it('restricts administration endpoints', async () => {
    await expectStatus(clients.superAdmin, 'GET', '/api/v1/admin/roles', 200, undefined, 'roles list');
    for (const key of ['citizen', 'clerk', 'officer', 'deptHead', 'districtAdmin']) {
      await expectStatus(clients[key], 'GET', '/api/v1/admin/roles', 403, undefined, 'roles list');
    }

    await expectStatus(clients.superAdmin, 'GET', '/api/v1/admin/settings', 200, undefined, 'settings');
    for (const key of ['citizen', 'clerk', 'officer', 'deptHead', 'districtAdmin']) {
      await expectStatus(clients[key], 'GET', '/api/v1/admin/settings', 403, undefined, 'settings');
    }

    await expectStatus(clients.superAdmin, 'GET', '/api/v1/admin/departments', 200, undefined, 'departments');
    await expectStatus(clients.superAdmin, 'POST', '/api/v1/admin/departments', 422, {}, 'department create validation');
    for (const key of ['citizen', 'clerk', 'officer', 'deptHead', 'districtAdmin']) {
      await expectStatus(clients[key], 'GET', '/api/v1/admin/departments', 403, undefined, 'departments');
      await expectStatus(clients[key], 'POST', '/api/v1/admin/departments', 403, { name: 'X', code: 'X' }, 'department create');
    }

    await expectStatus(clients.superAdmin, 'POST', '/api/v1/admin/users', 422, {}, 'user create validation');
    for (const key of ['citizen', 'clerk', 'officer', 'deptHead', 'districtAdmin']) {
      await expectStatus(clients[key], 'POST', '/api/v1/admin/users', 403, {}, 'user create');
    }

    await expectStatus(clients.superAdmin, 'GET', '/api/v1/admin/users', 200, undefined, 'users list');
    await expectStatus(clients.districtAdmin, 'GET', '/api/v1/admin/users', 200, undefined, 'users list');
    for (const key of ['citizen', 'clerk', 'officer', 'deptHead']) {
      await expectStatus(clients[key], 'GET', '/api/v1/admin/users', 403, undefined, 'users list');
    }

    await expectStatus(clients.superAdmin, 'GET', '/api/v1/admin/audit-logs', 200, undefined, 'audit logs');
    await expectStatus(clients.districtAdmin, 'GET', '/api/v1/admin/audit-logs', 200, undefined, 'audit logs');
    await expectStatus(clients.deptHead, 'GET', '/api/v1/admin/audit-logs', 403, undefined, 'audit logs');
  });

  it('restricts grievance workflow actions by role', async () => {
    const verifyBody = { department: fixtures.departments.a.id, category: fixtures.grievanceCategory._id };
    await expectStatus(clients.clerk, 'POST', `/api/v1/grievances/${MISSING_ID}/verify`, 404, verifyBody, 'grievance verify');
    await expectStatus(clients.superAdmin, 'POST', `/api/v1/grievances/${MISSING_ID}/verify`, 404, verifyBody, 'grievance verify');
    for (const key of ['citizen', 'officer', 'deptHead', 'districtAdmin']) {
      await expectStatus(clients[key], 'POST', `/api/v1/grievances/${MISSING_ID}/verify`, 403, verifyBody, 'grievance verify');
    }

    const assignBody = { officerId: fixtures.users.officer.id };
    for (const key of ['deptHead', 'districtAdmin', 'superAdmin']) {
      await expectStatus(clients[key], 'POST', `/api/v1/grievances/${MISSING_ID}/assign`, 404, assignBody, 'grievance assign');
    }
    for (const key of ['citizen', 'clerk', 'officer']) {
      await expectStatus(clients[key], 'POST', `/api/v1/grievances/${MISSING_ID}/assign`, 403, assignBody, 'grievance assign');
    }

    const decisionBody = { outcome: 'RESOLVED', reason: 'QA permission probe' };
    for (const key of ['deptHead', 'districtAdmin', 'superAdmin']) {
      await expectStatus(clients[key], 'POST', `/api/v1/grievances/${MISSING_ID}/decision`, 404, decisionBody, 'grievance decision');
    }
    for (const key of ['citizen', 'clerk', 'officer']) {
      await expectStatus(clients[key], 'POST', `/api/v1/grievances/${MISSING_ID}/decision`, 403, decisionBody, 'grievance decision');
    }

    const escalateBody = { reason: 'QA permission probe' };
    for (const key of ['deptHead', 'districtAdmin', 'superAdmin']) {
      await expectStatus(clients[key], 'POST', `/api/v1/grievances/${MISSING_ID}/escalate`, 404, escalateBody, 'grievance escalate');
    }
    for (const key of ['citizen', 'clerk', 'officer']) {
      await expectStatus(clients[key], 'POST', `/api/v1/grievances/${MISSING_ID}/escalate`, 403, escalateBody, 'grievance escalate');
    }
  });

  it('restricts file and application workflow actions by role', async () => {
    const dispatchBody = { toUser: fixtures.users.officer.id };
    for (const key of ['clerk', 'officer', 'superAdmin']) {
      await expectStatus(clients[key], 'POST', `/api/v1/files/${MISSING_ID}/dispatch`, 404, dispatchBody, 'file dispatch');
    }
    for (const key of ['citizen', 'deptHead', 'districtAdmin']) {
      await expectStatus(clients[key], 'POST', `/api/v1/files/${MISSING_ID}/dispatch`, 403, dispatchBody, 'file dispatch');
    }

    const decisionBody = { outcome: 'APPROVED', remarks: 'QA permission probe' };
    for (const key of ['deptHead', 'districtAdmin', 'superAdmin']) {
      await expectStatus(clients[key], 'POST', `/api/v1/files/${MISSING_ID}/decision`, 404, decisionBody, 'file decision');
    }
    for (const key of ['citizen', 'clerk', 'officer']) {
      await expectStatus(clients[key], 'POST', `/api/v1/files/${MISSING_ID}/decision`, 403, decisionBody, 'file decision');
    }

    const appDecisionBody = { outcome: 'APPROVED', reason: 'QA permission probe' };
    for (const key of ['deptHead', 'districtAdmin', 'superAdmin']) {
      await expectStatus(clients[key], 'POST', `/api/v1/applications/${MISSING_ID}/decision`, 404, appDecisionBody, 'application decision');
    }
    for (const key of ['citizen', 'clerk', 'officer']) {
      await expectStatus(clients[key], 'POST', `/api/v1/applications/${MISSING_ID}/decision`, 403, appDecisionBody, 'application decision');
    }
  });

  it('restricts disaster, weather and reporting endpoints', async () => {
    for (const key of ['citizen', 'clerk']) {
      await expectStatus(clients[key], 'GET', '/api/v1/weather-alerts', 403, undefined, 'weather list');
    }
    for (const key of ['officer', 'deptHead', 'districtAdmin', 'superAdmin']) {
      await expectStatus(clients[key], 'GET', '/api/v1/weather-alerts', 200, undefined, 'weather list');
    }
    for (const key of ['districtAdmin', 'superAdmin']) {
      await expectStatus(clients[key], 'POST', '/api/v1/weather-alerts', 422, {}, 'weather create');
    }
    for (const key of ['citizen', 'clerk', 'officer', 'deptHead']) {
      await expectStatus(clients[key], 'POST', '/api/v1/weather-alerts', 403, {}, 'weather create');
    }

    for (const key of ['deptHead', 'districtAdmin', 'superAdmin']) {
      await expectStatus(clients[key], 'POST', '/api/v1/incidents', 422, {}, 'incident create');
    }
    for (const key of ['citizen', 'clerk', 'officer']) {
      await expectStatus(clients[key], 'POST', '/api/v1/incidents', 403, {}, 'incident create');
    }

    await expectStatus(clients.citizen, 'GET', '/api/v1/reports', 403, undefined, 'reports');
    for (const key of ['clerk', 'officer', 'deptHead', 'districtAdmin', 'superAdmin']) {
      await expectStatus(clients[key], 'GET', '/api/v1/reports', 200, undefined, 'reports');
    }
  });

  it('separates own, department and district scopes on list endpoints', async () => {
    await expectStatus(clients.citizen, 'GET', '/api/v1/helpdesk/mine', 200, undefined, 'helpdesk mine');
    for (const key of ['clerk', 'officer', 'deptHead', 'districtAdmin']) {
      await expectStatus(clients[key], 'GET', '/api/v1/helpdesk/mine', 403, undefined, 'helpdesk mine');
    }
    await expectStatus(clients.citizen, 'GET', '/api/v1/helpdesk', 403, undefined, 'helpdesk queue');
    for (const key of ['clerk', 'officer', 'deptHead', 'districtAdmin', 'superAdmin']) {
      await expectStatus(clients[key], 'GET', '/api/v1/helpdesk', 200, undefined, 'helpdesk queue');
    }

    await expectStatus(clients.citizen, 'GET', '/api/v1/chat/conversations', 200, undefined, 'chat');
    for (const key of ['clerk', 'officer', 'deptHead', 'districtAdmin']) {
      await expectStatus(clients[key], 'GET', '/api/v1/chat/conversations', 403, undefined, 'chat');
    }
  });
});

describe('RBAC - record-level scope', () => {
  let grievanceId;
  let outsider;

  before(async () => {
    const created = await clients.citizen.post('/api/v1/grievances', {
      subject: 'QA scope isolation grievance',
      description: 'Created by the QA citizen account to verify record level access controls across roles.',
      category: fixtures.grievanceCategory._id,
      priority: 'NORMAL',
    });
    assertStatus(created, 201, 'create scope grievance');
    grievanceId = created.body.data._id;

    const verified = await clients.clerk.post(`/api/v1/grievances/${grievanceId}/verify`, {
      department: fixtures.departments.a.id,
      category: fixtures.grievanceCategory._id,
      priority: 'NORMAL',
      notes: 'Verified for scope testing',
    });
    assertOk(verified, 'verify scope grievance');

    const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    outsider = new ApiClient('outsider');
    const registered = await outsider.post('/api/v1/auth/register', {
      name: 'QA Scope Outsider',
      email: `qa.outsider.${stamp}@sdas.test`,
      mobile: `7${String(Math.floor(Math.random() * 1_000_000_000)).padStart(9, '0')}`,
      password: 'Outsider@123',
    });
    assertStatus(registered, 201, 'register outsider');
  });

  it('prevents a citizen from reading another citizen grievance', async () => {
    const response = await outsider.get(`/api/v1/grievances/${grievanceId}`);
    assert.equal(response.status, 403, `outsider detail: ${JSON.stringify(response.body)}`);
    assert.equal(response.body.error.code, 'FORBIDDEN_SCOPE');
    const list = await outsider.get('/api/v1/grievances?limit=100');
    assertOk(list, 'outsider list');
    assert.ok(!list.body.data.some((item) => item._id === grievanceId));
  });

  it('prevents an officer from another department from reading the grievance', async () => {
    const denied = await clients.officerOtherDept.get(`/api/v1/grievances/${grievanceId}`);
    assert.equal(denied.status, 403, `other dept detail: ${JSON.stringify(denied.body)}`);
    assert.equal(denied.body.error.code, 'FORBIDDEN_SCOPE');
    const list = await clients.officerOtherDept.get('/api/v1/grievances?limit=100');
    assertOk(list, 'other dept list');
    assert.ok(!list.body.data.some((item) => item._id === grievanceId));

    const allowed = await clients.officer.get(`/api/v1/grievances/${grievanceId}`);
    assertOk(allowed, 'same dept detail');
    assert.equal(allowed.body.data._id, grievanceId);
  });

  it('rejects assignment of an officer from another department', async () => {
    const response = await clients.deptHead.post(`/api/v1/grievances/${grievanceId}/assign`, {
      officerId: fixtures.users.officerOtherDept.id,
      remarks: 'Cross department assignment must fail',
    });
    assert.equal(response.status, 422, `cross dept assign: ${JSON.stringify(response.body)}`);
    assert.equal(response.body.error.code, 'INVALID_OFFICER');
  });

  it('allows the department head to assign a same-department officer', async () => {
    const response = await clients.deptHead.post(`/api/v1/grievances/${grievanceId}/assign`, {
      officerId: fixtures.users.officer.id,
      remarks: 'Scope verified',
    });
    assertOk(response, 'same dept assign');
    assert.equal(response.body.data.status, 'ASSIGNED');
  });
});
