import { authenticate, json, signRunTicket } from './_security.mjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });
  try {
    const session = await authenticate(req);
    if (!session) return json(res, 401, { error: 'unauthorized' });

    const now = new Date().toISOString();
    const ticket = signRunTicket(session.user.id);
    const runId = JSON.parse(Buffer.from(ticket.split('.')[0], 'base64url').toString('utf8')).runId;
    const { error } = await session.admin.from('score_runs').insert({
      run_id: runId,
      user_id: session.user.id,
      started_at: now
    });
    if (error) return json(res, 500, { error: 'run_ticket_storage_failed' });
    return json(res, 200, { ticket, expiresInSeconds: 1800 });
  } catch (error) {
    return json(res, error.status || 500, { error: error.status === 500 ? 'server_not_configured' : 'request_failed' });
  }
}
