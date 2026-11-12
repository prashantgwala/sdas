import { ApiClient, CREDENTIALS } from './lib/client.mjs';

const citizen = new ApiClient('citizen');
await citizen.login(CREDENTIALS.citizen.identifier, CREDENTIALS.citizen.password);

const created = await citizen.post('/api/v1/grievances', {
  subject: 'Broken streetlight near bus stand',
  description:
    'The streetlight on MG Road near the main bus stand has not worked for two weeks, making the area unsafe at night.',
  priority: 'NORMAL',
});
console.log('status:', created.status);
console.log(
  JSON.stringify({
    grievanceId: created.body.data?.grievanceId,
    category: created.body.data?.category?.name ?? created.body.data?.category,
    department: created.body.data?.department?.name ?? created.body.data?.department,
    aiSuggestion: created.body.data?.aiSuggestion,
  }),
);
