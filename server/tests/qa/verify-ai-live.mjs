import { ApiClient, CREDENTIALS } from './lib/client.mjs';

const citizen = new ApiClient('citizen');
await citizen.login(CREDENTIALS.citizen.identifier, CREDENTIALS.citizen.password);

const created = await citizen.post('/api/v1/chat/conversations', { language: 'en' });
if (created.status !== 201 && created.status !== 200) {
  throw new Error(`conversation create failed: ${created.status} ${JSON.stringify(created.body)}`);
}
const conversationId = created.body.data._id;
console.log('conversation:', conversationId);

for (const [language, question] of [
  ['en', 'How do I submit a grievance?'],
  ['hi', 'शिकायत कैसे दर्ज करें?'],
]) {
  const sent = await citizen.post(`/api/v1/chat/conversations/${conversationId}/messages`, {
    content: question,
    language,
  });
  if (sent.status !== 200) {
    throw new Error(`message send failed: ${sent.status} ${JSON.stringify(sent.body)}`);
  }
  const answer = sent.body.data.answer;
  console.log(
    JSON.stringify({
      language,
      status: sent.status,
      confidence: answer.confidence,
      escalated: answer.escalated,
      sources: answer.sources.map((source) => source.title),
      answer: answer.answer,
    }),
  );
}
