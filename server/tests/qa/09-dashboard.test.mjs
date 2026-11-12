import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { ApiClient, CREDENTIALS, assertOk } from './lib/client.mjs';

const clients = {};

const roleCases = [
  ['citizen', 'CITIZEN'],
  ['clerk', 'CLERK'],
  ['officer', 'OFFICER'],
  ['deptHead', 'DEPARTMENT_HEAD'],
  ['districtAdmin', 'DISTRICT_ADMIN'],
  ['superAdmin', 'SUPER_ADMIN'],
];

before(async () => {
  for (const [key, role] of roleCases) {
    const client = new ApiClient(`dashboard-${key}`);
    await client.login(CREDENTIALS[key].identifier, CREDENTIALS[key].password);
    assert.equal(client.user.role, role, `${key} role mismatch`);
    clients[key] = client;
  }
});

describe('Dashboard aggregation for every role', () => {
  for (const [key, role] of roleCases) {
    it(`returns a scoped dashboard payload for ${role}`, async () => {
      const response = await clients[key].get('/api/v1/dashboard');
      assertOk(response, `${role} dashboard`);
      const data = response.body.data;
      assert.equal(data.role, role);
      assert.ok(data.generatedAt, 'generatedAt missing');
      assert.ok(data.stats && typeof data.stats === 'object', 'stats missing');
      assert.ok(Array.isArray(data.tasks), 'tasks must be an array');
      assert.ok(data.charts, 'charts missing');
      assert.ok(Array.isArray(data.charts.grievancesByStatus), 'grievancesByStatus must be an array');
      assert.ok(Array.isArray(data.charts.applicationsByStatus), 'applicationsByStatus must be an array');
      assert.ok(Array.isArray(data.charts.grievanceTrend), 'grievanceTrend must be an array');
      assert.equal(data.charts.grievanceTrend.length, 14, 'grievance trend must cover 14 days');
      for (const point of data.charts.grievanceTrend) {
        assert.match(point.date, /^\d{4}-\d{2}-\d{2}$/);
        assert.equal(typeof point.value, 'number');
      }
      assert.ok(data.recent && Array.isArray(data.recent.grievances), 'recent.grievances must be an array');
      assert.ok(Array.isArray(data.recent.applications), 'recent.applications must be an array');

      const statusSum = data.charts.grievancesByStatus.reduce((total, row) => total + row.value, 0);
      assert.equal(statusSum, data.stats.totalGrievances, `${role} status chart must cover every scoped grievance`);
      assert.ok(data.stats.totalGrievances > 0, `${role} should see seeded grievances`);

      const unread = await clients[key].get('/api/v1/notifications/unread-count');
      assertOk(unread, `${role} unread count`);
      assert.equal(unread.body.data.unread, data.stats.unread, `${role} unread mismatch`);
    });
  }

  it('gives citizens only their own grievances and applications', async () => {
    const response = await clients.citizen.get('/api/v1/dashboard');
    assertOk(response, 'citizen dashboard');
    const data = response.body.data;
    assert.ok(data.feedback && typeof data.feedback.average === 'number', 'feedback summary missing');
    assert.equal(typeof data.feedback.count, 'number');
    assert.equal(data.district, undefined, 'citizen must not receive district-wide data');
    assert.equal(data.system, undefined, 'citizen must not receive system data');

    const own = await clients.citizen.get('/api/v1/grievances?limit=100');
    assertOk(own, 'citizen grievance list');
    for (const item of data.recent.grievances) {
      assert.equal(item.citizen, undefined, 'recent grievance must not expose citizen ref');
      assert.ok(
        own.body.data.some((row) => row.grievanceId === item.grievanceId),
        `recent grievance ${item.grievanceId} is not owned by the citizen`,
      );
    }
  });

  it('gives department heads approval queue context and district admins district data', async () => {
    const head = await clients.deptHead.get('/api/v1/dashboard');
    assertOk(head, 'department head dashboard');
    assert.ok(Array.isArray(head.body.data.officerWorkload), 'officerWorkload missing');
    assert.ok(Array.isArray(head.body.data.inbox), 'inbox missing');
    assert.equal(typeof head.body.data.stats.pendingApprovals, 'number');
    assert.equal(head.body.data.district, undefined, 'department head must not receive district data');

    const district = await clients.districtAdmin.get('/api/v1/dashboard');
    assertOk(district, 'district admin dashboard');
    const districtData = district.body.data.district;
    assert.ok(districtData, 'district block missing');
    assert.ok(Array.isArray(districtData.grievanceByDepartment), 'grievanceByDepartment missing');
    assert.ok(Array.isArray(districtData.applicationByDepartment), 'applicationByDepartment missing');
    assert.equal(typeof districtData.activeStaff, 'number');
    assert.equal(district.body.data.system, undefined, 'district admin must not receive system data');

    const superAdmin = await clients.superAdmin.get('/api/v1/dashboard');
    assertOk(superAdmin, 'super admin dashboard');
    assert.ok(superAdmin.body.data.district, 'super admin district block missing');
    assert.ok(superAdmin.body.data.system, 'super admin system block missing');
    assert.ok(Array.isArray(superAdmin.body.data.system.usersByRole), 'usersByRole missing');
    assert.ok(Array.isArray(superAdmin.body.data.system.integrations), 'integrations missing');
  });

  it('scopes officer dashboards to assigned or actionable grievances', async () => {
    const response = await clients.officer.get('/api/v1/dashboard');
    assertOk(response, 'officer dashboard');
    const data = response.body.data;
    assert.equal(data.district, undefined);
    const own = await clients.officer.get('/api/v1/grievances?limit=100');
    assertOk(own, 'officer grievance list');
    assert.equal(data.stats.totalGrievances, own.body.data.length, 'officer dashboard must match scoped list');
  });
});
