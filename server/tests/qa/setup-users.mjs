import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ApiClient, BASE, CREDENTIALS, assertOk, assertStatus } from './lib/client.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.join(here, 'fixtures.json');

const admin = new ApiClient('qa-super-admin');
await admin.login(CREDENTIALS.superAdmin.identifier, CREDENTIALS.superAdmin.password);

const catalogs = await admin.get('/api/v1/reference/catalogs');
assertOk(catalogs, 'reference catalogs');
const { departments, grievanceCategories, applicationTypes, fileCategories } = catalogs.body.data;

if (!departments?.length) throw new Error('QA seed is missing departments');
if (!grievanceCategories?.length) throw new Error('QA seed is missing grievance categories');
if (!applicationTypes?.length) throw new Error('QA seed is missing application types');
if (!fileCategories?.length) throw new Error('QA seed is missing file categories');

const deptA = departments[0];
const deptB = departments[1] ?? departments[0];

const users = [
  { key: 'citizen', role: 'CITIZEN', name: 'QA Citizen', email: 'qa.citizen@sdas.test', mobile: '9000000002', password: 'QaCitizen@123' },
  { key: 'clerk', role: 'CLERK', name: 'QA Clerk', email: 'qa.clerk@sdas.test', mobile: '9000000003', password: 'QaClerk@12345', department: deptA._id },
  { key: 'officer', role: 'OFFICER', name: 'QA Officer', email: 'qa.officer@sdas.test', mobile: '9000000004', password: 'QaOfficer@12345', department: deptA._id },
  { key: 'officerOtherDept', role: 'OFFICER', name: 'QA Officer B', email: 'qa.officer2@sdas.test', mobile: '9000000007', password: 'QaOfficer@12345', department: deptB._id },
  { key: 'deptHead', role: 'DEPARTMENT_HEAD', name: 'QA Department Head', email: 'qa.head@sdas.test', mobile: '9000000005', password: 'QaHead@12345', department: deptA._id },
  { key: 'districtAdmin', role: 'DISTRICT_ADMIN', name: 'QA District Admin', email: 'qa.district@sdas.test', mobile: '9000000006', password: 'QaDistrict@123', department: deptA._id },
];

const created = {};
for (const user of users) {
  const existing = await admin.get(`/api/v1/admin/users?q=${encodeURIComponent(user.email)}&limit=5`);
  assertOk(existing, `lookup ${user.email}`);
  const found = (existing.body.data.items ?? []).find((item) => item.email === user.email);
  if (found) {
    created[user.key] = found;
    continue;
  }
  const response = await admin.post('/api/v1/admin/users', {
    name: user.name,
    email: user.email,
    mobile: user.mobile,
    password: user.password,
    role: user.role,
    department: user.department,
    designation: `QA ${user.role}`,
    status: 'ACTIVE',
  });
  assertStatus(response, 201, `create ${user.role}`);
  created[user.key] = response.body.data;
}

const fixtures = {
  createdAt: new Date().toISOString(),
  apiBase: BASE,
  dbName: process.env.DB_NAME,
  departments: {
    a: { id: deptA._id, name: deptA.name, code: deptA.code },
    b: { id: deptB._id, name: deptB.name, code: deptB.code },
  },
  grievanceCategory: grievanceCategories[0],
  applicationType: applicationTypes[0],
  applicationTypeWithDocs: applicationTypes.find((type) => (type.requiredDocuments ?? []).length > 0) ?? applicationTypes[0],
  fileCategory: fileCategories[0],
  users: Object.fromEntries(Object.entries(created).map(([key, user]) => [key, {
    id: String(user._id ?? user.id),
    role: user.role,
    email: user.email,
    department: user.department ? String(user.department._id ?? user.department) : null,
  }])),
  admin: {
    id: String(admin.user.id),
    role: admin.user.role,
  },
};

fs.writeFileSync(fixturePath, `${JSON.stringify(fixtures, null, 2)}\n`);
console.log(`QA fixtures written: ${fixturePath}`);
console.log(`users: ${Object.keys(created).join(', ')}`);
console.log(`departments: ${fixtures.departments.a.name} / ${fixtures.departments.b.name}`);
