import { ApiClient, CREDENTIALS } from './lib/client.mjs';

const admin = new ApiClient('superAdmin');
await admin.login(CREDENTIALS.superAdmin.identifier, CREDENTIALS.superAdmin.password);

const settings = await admin.get('/api/v1/admin/settings');
if (settings.status !== 200) throw new Error(`settings read failed: ${settings.status}`);
const keys = ['ai.enabled', 'ai.externalEnabled', 'ai.requireHumanReview'];
const before = Object.fromEntries(
  settings.body.data.filter((row) => keys.includes(row.key)).map((row) => [row.key, row.value]),
);
console.log('before:', JSON.stringify(before));

const update = await admin.put('/api/v1/admin/settings/ai.externalEnabled', { value: true });
console.log('setting update:', update.status, JSON.stringify(update.body?.data?.value));

const integration = await admin.patch('/api/v1/admin/integrations/ai', {
  provider: `OpenRouter (${process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini'})`,
  status: 'CONFIGURED',
  notes:
    'OpenRouter key configured. Live answers are grounded in approved knowledge articles and still require human review.',
});
console.log('integration update:', integration.status, integration.body?.data?.status);

const after = await admin.get('/api/v1/admin/settings');
const values = Object.fromEntries(
  after.body.data.filter((row) => keys.includes(row.key)).map((row) => [row.key, row.value]),
);
console.log('after:', JSON.stringify(values));
