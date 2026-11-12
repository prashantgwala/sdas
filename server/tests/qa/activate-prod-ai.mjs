import 'dotenv/config';

const BASE = process.env.PROD_API_BASE || 'http://localhost:5000';
const cookies = new Map();

function absorb(headers) {
  for (const cookie of headers.getSetCookie?.() ?? []) {
    const [pair] = cookie.split(';');
    const index = pair.indexOf('=');
    if (index <= 0) continue;
    const name = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    if (value === '') cookies.delete(name);
    else cookies.set(name, value);
  }
}

async function request(method, path, body) {
  const headers = {};
  if (cookies.size > 0) headers.cookie = [...cookies].map(([name, value]) => `${name}=${value}`).join('; ');
  const csrf = cookies.get('sdas_csrf');
  if (csrf && !['GET', 'HEAD'].includes(method)) headers['x-csrf-token'] = csrf;
  let payload;
  if (body !== undefined) {
    headers['content-type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const response = await fetch(BASE + path, { method, headers, body: payload });
  absorb(response.headers);
  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return { status: response.status, body: parsed };
}

const identifier = process.env.SEED_ADMIN_EMAIL;
const password = process.env.SEED_ADMIN_PASSWORD;
if (!identifier || !password) throw new Error('SEED_ADMIN credentials missing in server/.env');

const login = await request('POST', '/api/v1/auth/login', { identifier, password });
console.log('login:', login.status, login.body?.data?.user?.role ?? login.body?.error?.code);
if (login.status !== 200) process.exit(1);

const before = await request('GET', '/api/v1/admin/settings');
const readAll = (list) =>
  Object.fromEntries(
    ['ai.enabled', 'ai.externalEnabled', 'ai.requireHumanReview'].map((key) => [
      key,
      list?.data?.find?.((row) => row.key === key)?.value,
    ]),
  );
console.log('before:', JSON.stringify(readAll(before.body)));

const update = await request('PUT', '/api/v1/admin/settings/ai.externalEnabled', { value: true });
console.log('setting update:', update.status, update.body?.data?.value);

const integration = await request('PATCH', '/api/v1/admin/integrations/ai', {
  provider: `OpenRouter (${process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini'})`,
  status: 'CONFIGURED',
});
console.log('integration update:', integration.status, integration.body?.data?.status);

const tested = await request('POST', '/api/v1/admin/integrations/ai/test', {});
console.log('integration test:', tested.status, JSON.stringify(tested.body?.data));

const after = await request('GET', '/api/v1/admin/settings');
console.log('after:', JSON.stringify(readAll(after.body)));
