import { authenticate, json, signRunTicket } from './_security.mjs';
import { insertScoreRun } from './_db.mjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });
  try {
    const session = await authenticate(req);
    if (!session) return json(res, 401, { error: 'unauthorized' });

    const ticket = signRunTicket(session.user.id);
    const payload = JSON.parse(Buffer.from(ticket.split('.')[0], 'base64url').toString('utf8'));
    await insertScoreRun({ runId: payload.runId, userId: session.user.id, startedAt: new Date(payload.startedAt).toISOString() });
    return json(res, 200, { ticket, expiresInSeconds: 1800 });
  } catch (error) {
    return json(res, error.status || 500, { error: error.status === 500 ? 'server_not_configured' : 'request_failed' });
  }
}
