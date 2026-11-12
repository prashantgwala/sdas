import assert from 'node:assert/strict';

export const BASE = process.env.QA_API_BASE || 'http://localhost:5001';

if (!String(process.env.DB_NAME || '').startsWith('sdas_qa_')) {
  throw new Error('Refusing to run QA tests without an isolated sdas_qa_* DB_NAME');
}

const JSON_METHODS_WITHOUT_BODY = new Set(['GET', 'HEAD']);

export class ApiClient {
  constructor(label = 'anon') {
    this.label = label;
    this.cookies = new Map();
    this.user = null;
    this.permissions = [];
  }

  absorbCookies(response) {
    const cookies = response.headers.getSetCookie?.() ?? [];
    for (const cookie of cookies) {
      const [pair] = cookie.split(';');
      const index = pair.indexOf('=');
      if (index <= 0) continue;
      const name = pair.slice(0, index).trim();
      const value = pair.slice(index + 1).trim();
      if (value === '') this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }

  cookieHeader() {
    return [...this.cookies.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
  }

  get csrf() {
    return this.cookies.get('sdas_csrf');
  }

  async request(method, path, options = {}) {
    const { body, headers = {} } = options;
    const requestHeaders = { ...headers };
    if (this.cookies.size > 0) requestHeaders.cookie = this.cookieHeader();
    if (this.csrf && !['GET', 'HEAD', 'OPTIONS'].includes(method) && !requestHeaders['x-csrf-token']) {
      requestHeaders['x-csrf-token'] = this.csrf;
    }

    let payload;
    if (body instanceof FormData) {
      payload = body;
    } else if (body !== undefined && !JSON_METHODS_WITHOUT_BODY.has(method)) {
      requestHeaders['content-type'] = requestHeaders['content-type'] || 'application/json';
      payload = JSON.stringify(body);
    }

    const response = await fetch(BASE + path, {
      method,
      headers: requestHeaders,
      body: payload,
      redirect: 'manual',
    });
    this.absorbCookies(response);

    const text = await response.text();
    let parsed = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    return { status: response.status, body: parsed, headers: response.headers };
  }

  get(path, options) {
    return this.request('GET', path, options);
  }

  post(path, body, options = {}) {
    return this.request('POST', path, { ...options, body });
  }

  patch(path, body, options = {}) {
    return this.request('PATCH', path, { ...options, body });
  }

  put(path, body, options = {}) {
    return this.request('PUT', path, { ...options, body });
  }

  delete(path, options) {
    return this.request('DELETE', path, options);
  }

  async login(identifier, password) {
    const response = await this.post('/api/v1/auth/login', { identifier, password });
    assert.equal(response.status, 200, `login failed for ${identifier}: ${JSON.stringify(response.body)}`);
    this.user = response.body.data.user;
    this.permissions = response.body.data.permissions;
    return response;
  }

  async logout() {
    const response = await this.post('/api/v1/auth/logout', {});
    this.user = null;
    this.permissions = [];
    return response;
  }
}

export function assertStatus(response, expected, message) {
  assert.equal(
    response.status,
    expected,
    `${message || 'unexpected status'} -> ${response.status} ${JSON.stringify(response.body)}`,
  );
}

export function assertOk(response, message) {
  assertStatus(response, 200, message);
  assert.equal(response.body?.success, true, `${message}: success !== true`);
}

export function assertError(response, status, code, message) {
  assertStatus(response, status, message);
  assert.equal(response.body?.success, false, `${message}: success !== false`);
  if (code) assert.equal(response.body?.error?.code, code, `${message}: expected code ${code}`);
}

export function expectPermission(permissions, permission, expected, label) {
  assert.equal(
    permissions.includes(permission),
    expected,
    `${label || 'role'} ${expected ? 'missing' : 'unexpectedly has'} ${permission}`,
  );
}

export const CREDENTIALS = {
  superAdmin: { identifier: 'qa.admin@sdas.test', password: 'QaAdmin@12345' },
  districtAdmin: { identifier: 'qa.district@sdas.test', password: 'QaDistrict@123' },
  deptHead: { identifier: 'qa.head@sdas.test', password: 'QaHead@12345' },
  officer: { identifier: 'qa.officer@sdas.test', password: 'QaOfficer@12345' },
  officerOtherDept: { identifier: 'qa.officer2@sdas.test', password: 'QaOfficer@12345' },
  clerk: { identifier: 'qa.clerk@sdas.test', password: 'QaClerk@12345' },
  citizen: { identifier: 'qa.citizen@sdas.test', password: 'QaCitizen@123' },
};
