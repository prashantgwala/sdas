import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import jwt from 'jsonwebtoken';
import {
  ApiClient,
  CREDENTIALS,
  assertError,
  assertOk,
  assertStatus,
} from './lib/client.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtures = JSON.parse(fs.readFileSync(path.join(here, 'fixtures.json'), 'utf8'));

const admin = new ApiClient('admin');
let adminUserId;

async function createDisposableCitizen(prefix) {
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const email = `${prefix}.${stamp}@sdas.test`;
  const mobile = `9${String(Math.floor(Math.random() * 1_000_000_000)).padStart(9, '0')}`;
  const response = await admin.post('/api/v1/admin/users', {
    name: `QA ${prefix}`,
    email,
    mobile,
    password: 'Disposable@123',
    role: 'CITIZEN',
    status: 'ACTIVE',
  });
  assertStatus(response, 201, `create disposable ${prefix}`);
  return { ...response.body.data, password: 'Disposable@123' };
}

before(async () => {
  await admin.login(CREDENTIALS.superAdmin.identifier, CREDENTIALS.superAdmin.password);
  adminUserId = admin.user.id;
});

describe('Authentication', () => {
  it('logs in with valid credentials and issues scoped cookies', async () => {
    const client = new ApiClient('citizen');
    const response = await client.post('/api/v1/auth/login', CREDENTIALS.citizen);
    assertStatus(response, 200, 'login citizen');
    assert.equal(response.body.data.user.email, CREDENTIALS.citizen.identifier);
    assert.equal(response.body.data.user.role, 'CITIZEN');
    assert.ok(Array.isArray(response.body.data.permissions));
    assert.ok(response.body.data.permissions.includes('grievance.create'));
    assert.equal(response.body.data.dashboard, '/citizen');
    assert.ok(!JSON.stringify(response.body.data).includes('passwordHash'));

    const cookies = response.headers.getSetCookie().join('\n');
    assert.match(cookies, /sdas_access=.*HttpOnly/i);
    assert.match(cookies, /sdas_refresh=.*HttpOnly/i);
    assert.match(cookies, /sdas_csrf=/i);
    assert.doesNotMatch(cookies.split('\n').find((line) => line.startsWith('sdas_csrf=')) ?? '', /HttpOnly/i);
  });

  it('rejects a wrong password without leaking account existence', async () => {
    const client = new ApiClient('wrong-password');
    const response = await client.post('/api/v1/auth/login', {
      identifier: CREDENTIALS.citizen.identifier,
      password: 'DefinitelyWrong@1',
    });
    assertError(response, 401, 'INVALID_CREDENTIALS', 'wrong password');
    assert.equal(response.body.error.message, 'Invalid credentials');
  });

  it('rejects an unknown identifier with the same message', async () => {
    const client = new ApiClient('unknown');
    const response = await client.post('/api/v1/auth/login', {
      identifier: 'nobody.here@sdas.test',
      password: 'Whatever@123',
    });
    assertError(response, 401, 'INVALID_CREDENTIALS', 'unknown identifier');
    assert.equal(response.body.error.message, 'Invalid credentials');
  });

  it('validates the login payload', async () => {
    const client = new ApiClient('validation');
    assertError(await client.post('/api/v1/auth/login', { identifier: 'ab' }), 422, 'VALIDATION_ERROR', 'short identifier');
    assertError(await client.post('/api/v1/auth/login', {}), 422, 'VALIDATION_ERROR', 'empty login');
    assertError(
      await client.post('/api/v1/auth/login', { identifier: { $ne: null }, password: 'x' }),
      422,
      'VALIDATION_ERROR',
      'nosql login injection',
    );
  });

  it('blocks unauthenticated access to protected endpoints', async () => {
    const client = new ApiClient('anon');
    for (const route of [
      '/api/v1/auth/me',
      '/api/v1/grievances',
      '/api/v1/files',
      '/api/v1/applications',
      '/api/v1/dashboard',
      '/api/v1/admin/users',
      '/api/v1/notifications',
    ]) {
      assertError(await client.get(route), 401, 'UNAUTHORIZED', `anon ${route}`);
    }
  });

  it('returns the current user and permissions for a valid session', async () => {
    const client = new ApiClient('citizen-me');
    await client.login(CREDENTIALS.citizen.identifier, CREDENTIALS.citizen.password);
    const response = await client.get('/api/v1/auth/me');
    assertOk(response, 'auth/me');
    assert.equal(response.body.data.user.id, fixtures.users.citizen.id);
    assert.ok(response.body.data.permissions.length > 0);
  });

  it('accepts a Bearer access token', async () => {
    const client = new ApiClient('bearer');
    await client.login(CREDENTIALS.officer.identifier, CREDENTIALS.officer.password);
    const token = client.cookies.get('sdas_access');
    const bearerClient = new ApiClient('bearer-only');
    const response = await bearerClient.get('/api/v1/auth/me', {
      headers: { authorization: `Bearer ${token}` },
    });
    assertOk(response, 'bearer auth');
    assert.equal(response.body.data.user.role, 'OFFICER');
  });

  it('rejects a tampered access token', async () => {
    const client = new ApiClient('tampered');
    await client.login(CREDENTIALS.citizen.identifier, CREDENTIALS.citizen.password);
    client.cookies.set('sdas_access', `${client.cookies.get('sdas_access')}x`);
    assertError(await client.get('/api/v1/auth/me'), 401, 'UNAUTHORIZED', 'tampered token');
  });

  it('rejects an expired access token', async () => {
    const client = new ApiClient('expired');
    await client.login(CREDENTIALS.citizen.identifier, CREDENTIALS.citizen.password);
    const decoded = jwt.decode(client.cookies.get('sdas_access'));
    const expired = jwt.sign(
      { sub: decoded.sub, sid: decoded.sid, role: decoded.role, type: 'access' },
      process.env.JWT_ACCESS_SECRET,
      { expiresIn: -10 },
    );
    client.cookies.set('sdas_access', expired);
    assertError(await client.get('/api/v1/auth/me'), 401, 'UNAUTHORIZED', 'expired token');
  });

  it('refreshes the session and rotates the refresh token', async () => {
    const client = new ApiClient('refresh');
    await client.login(CREDENTIALS.citizen.identifier, CREDENTIALS.citizen.password);
    const oldRefresh = client.cookies.get('sdas_refresh');
    const oldAccess = client.cookies.get('sdas_access');
    const response = await client.post('/api/v1/auth/refresh', {});
    assertOk(response, 'refresh');
    assert.ok(response.body.data.csrfToken);
    assert.notEqual(client.cookies.get('sdas_refresh'), oldRefresh);
    const newAccess = client.cookies.get('sdas_access');
    assert.ok(newAccess, 'refresh must issue an access token');
    assert.ok(jwt.decode(newAccess).iat >= jwt.decode(oldAccess).iat, 'access token must not move backwards in time');
    assertOk(await client.get('/api/v1/auth/me'), 'me after refresh');

    const replay = new ApiClient('refresh-replay');
    replay.cookies.set('sdas_refresh', oldRefresh);
    const replayResponse = await replay.post('/api/v1/auth/refresh', {});
    assertError(replayResponse, 401, 'SESSION_EXPIRED', 'refresh replay');
    assertError(await client.get('/api/v1/auth/me'), 401, 'SESSION_EXPIRED', 'session revoked after replay');
  });

  it('rejects refresh without a refresh cookie', async () => {
    const client = new ApiClient('no-refresh');
    assertError(await client.post('/api/v1/auth/refresh', {}), 401, 'UNAUTHORIZED', 'missing refresh');
  });

  it('requires a CSRF token for state-changing requests', async () => {
    const client = new ApiClient('csrf');
    await client.login(CREDENTIALS.citizen.identifier, CREDENTIALS.citizen.password);
    const token = client.cookies.get('sdas_csrf');
    client.cookies.delete('sdas_csrf');
    const blocked = await client.patch('/api/v1/auth/preferences', { theme: 'dark' });
    assertError(blocked, 403, 'CSRF_TOKEN_INVALID', 'missing csrf');

    client.cookies.set('sdas_csrf', token);
    const mismatch = await client.patch(
      '/api/v1/auth/preferences',
      { theme: 'dark' },
      { headers: { 'x-csrf-token': 'not-the-right-token' } },
    );
    assertError(mismatch, 403, 'CSRF_TOKEN_INVALID', 'mismatched csrf');

    const allowed = await client.patch('/api/v1/auth/preferences', { theme: 'dark' });
    assertOk(allowed, 'valid csrf');
  });

  it('rejects requests from a foreign origin', async () => {
    const client = new ApiClient('origin');
    await client.login(CREDENTIALS.citizen.identifier, CREDENTIALS.citizen.password);
    const response = await client.post(
      '/api/v1/grievances',
      {
        subject: 'Origin check grievance',
        description: 'This request comes from an untrusted origin and must be rejected.',
      },
      { headers: { origin: 'http://evil.example' } },
    );
    assert.equal(response.status, 403, 'foreign origin status');
    assert.ok(['CORS_REJECTED', 'CSRF_ORIGIN_REJECTED'].includes(response.body.error.code));
  });

  it('logs out and revokes the session server-side', async () => {
    const client = new ApiClient('logout');
    await client.login(CREDENTIALS.citizen.identifier, CREDENTIALS.citizen.password);
    assertOk(await client.post('/api/v1/auth/logout', {}), 'logout');
    assertError(await client.get('/api/v1/auth/me'), 401, 'UNAUTHORIZED', 'me after logout');
    assertError(await client.post('/api/v1/auth/refresh', {}), 401, 'UNAUTHORIZED', 'refresh after logout');
  });

  it('blocks login for an inactive account', async () => {
    const user = await createDisposableCitizen('inactive');
    const suspended = await admin.post(`/api/v1/admin/users/${user._id}/status`, {
      status: 'SUSPENDED',
      reason: 'QA test',
    });
    assertOk(suspended, 'suspend user');
    const client = new ApiClient('inactive');
    const response = await client.post('/api/v1/auth/login', {
      identifier: user.email,
      password: user.password,
    });
    assertError(response, 403, 'ACCOUNT_INACTIVE', 'suspended login');
    await admin.post(`/api/v1/admin/users/${user._id}/status`, { status: 'ACTIVE' });
  });

  it('locks an account after repeated failures and admin reset unlocks it', async () => {
    const user = await createDisposableCitizen('lock');
    const client = new ApiClient('lockout');
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await client.post('/api/v1/auth/login', {
        identifier: user.email,
        password: 'WrongPass@123',
      });
      assertError(response, 401, 'INVALID_CREDENTIALS', `failed attempt ${attempt + 1}`);
    }
    const locked = await client.post('/api/v1/auth/login', {
      identifier: user.email,
      password: user.password,
    });
    assertError(locked, 423, 'ACCOUNT_LOCKED', 'locked account');

    const reset = await admin.post(`/api/v1/admin/users/${user._id}/reset-password`, {
      password: 'Unlocked@12345',
      reason: 'QA lockout test',
    });
    assertOk(reset, 'admin reset password');
    const unlocked = await client.post('/api/v1/auth/login', {
      identifier: user.email,
      password: 'Unlocked@12345',
    });
    assertStatus(unlocked, 200, 'login after unlock');
  });

  it('completes password reset with a one-time code', async () => {
    const user = await createDisposableCitizen('reset');
    const client = new ApiClient('reset');
    const request = await client.post('/api/v1/auth/forgot-password', { identifier: user.email });
    assertOk(request, 'forgot password');
    assert.equal(request.body.data.delivery, 'NONE');
    assert.ok(request.body.data.masked.includes('***'));
    assert.match(request.body.data.devCode, /^\d{6}$/);

    const verify = await client.post('/api/v1/auth/verify-otp', {
      identifier: user.email,
      code: request.body.data.devCode,
      purpose: 'RESET_PASSWORD',
    });
    assertOk(verify, 'verify otp');

    const reset = await client.post('/api/v1/auth/reset-password', {
      identifier: user.email,
      code: request.body.data.devCode,
      newPassword: 'ResetPass@123',
    });
    assertOk(reset, 'reset password');

    const reused = await client.post('/api/v1/auth/reset-password', {
      identifier: user.email,
      code: request.body.data.devCode,
      newPassword: 'AnotherPass@123',
    });
    assertError(reused, 400, 'INVALID_OTP', 'reused otp');

    const login = await client.post('/api/v1/auth/login', {
      identifier: user.email,
      password: 'ResetPass@123',
    });
    assertStatus(login, 200, 'login with reset password');
  });

  it('changes the password and invalidates old credentials', async () => {
    const user = await createDisposableCitizen('change');
    const client = new ApiClient('change');
    await client.login(user.email, user.password);
    const wrong = await client.post('/api/v1/auth/change-password', {
      currentPassword: 'NotMyPassword@1',
      newPassword: 'Changed@12345',
    });
    assertError(wrong, 400, 'INVALID_PASSWORD', 'wrong current password');
    const changed = await client.post('/api/v1/auth/change-password', {
      currentPassword: user.password,
      newPassword: 'Changed@12345',
    });
    assertOk(changed, 'change password');

    const oldLogin = new ApiClient('old-login');
    assertError(
      await oldLogin.post('/api/v1/auth/login', { identifier: user.email, password: user.password }),
      401,
      'INVALID_CREDENTIALS',
      'old password rejected',
    );
    const newLogin = new ApiClient('new-login');
    assertStatus(
      await newLogin.post('/api/v1/auth/login', { identifier: user.email, password: 'Changed@12345' }),
      200,
      'new password accepted',
    );
  });

  it('ignores privilege fields during self-registration', async () => {
    const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const client = new ApiClient('register');
    const response = await client.post('/api/v1/auth/register', {
      name: 'QA Registered Citizen',
      email: `qa.register.${stamp}@sdas.test`,
      mobile: `8${String(Date.now()).slice(-9)}`,
      password: 'Register@123',
      role: 'SUPER_ADMIN',
      permissions: ['user.create'],
      status: 'ACTIVE',
    });
    assertStatus(response, 201, 'register');
    assert.equal(response.body.data.user.role, 'CITIZEN');
    assert.ok(!response.body.data.permissions.includes('user.create'));

    const duplicate = await new ApiClient('dup').post('/api/v1/auth/register', {
      name: 'QA Registered Citizen',
      email: `qa.register.${stamp}@sdas.test`,
      mobile: `7${String(Date.now()).slice(-9)}`,
      password: 'Register@123',
    });
    assertError(duplicate, 409, 'ACCOUNT_EXISTS', 'duplicate registration');

    const weak = await new ApiClient('weak').post('/api/v1/auth/register', {
      name: 'QA Weak',
      email: `qa.weak.${stamp}@sdas.test`,
      mobile: `6${String(Date.now()).slice(-9)}`,
      password: 'weakpassword',
    });
    assertError(weak, 422, 'VALIDATION_ERROR', 'weak password');
  });

  it('does not expose sensitive fields on the profile endpoint', async () => {
    const client = new ApiClient('profile');
    await client.login(CREDENTIALS.districtAdmin.identifier, CREDENTIALS.districtAdmin.password);
    const me = await client.get('/api/v1/auth/me');
    assertOk(me, 'district me');
    const serialized = JSON.stringify(me.body);
    for (const forbidden of ['passwordHash', 'refreshTokenHash', 'tokenHash', 'otpHash']) {
      assert.ok(!serialized.includes(forbidden), `profile leaked ${forbidden}`);
    }
    const profile = await client.get('/api/v1/auth/profile');
    assertOk(profile, 'profile');
    assert.equal(profile.body.data.user.role, 'DISTRICT_ADMIN');
  });

  it('allows the admin to update own profile but rejects invalid mobile', async () => {
    const client = new ApiClient('profile-update');
    await client.login(CREDENTIALS.superAdmin.identifier, CREDENTIALS.superAdmin.password);
    assertOk(await client.patch('/api/v1/auth/profile', { designation: 'QA Lead' }), 'update profile');
    assertError(
      await client.patch('/api/v1/auth/profile', { mobile: '12345' }),
      422,
      'VALIDATION_ERROR',
      'invalid mobile',
    );
  });
});
