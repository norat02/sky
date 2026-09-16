import { authenticate, json } from './_security.mjs';
import { completeScoreReward, unlockCharacter } from '../server/economy.mjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });
  try {
    const session = await authenticate(req);
    if (!session) return json(res, 401, { error: 'unauthorized' });
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const operation = String(body.operation || '');
    const profile = operation === 'unlock_character'
      ? await unlockCharacter({ userId: session.user.id, character: String(body.character || '') })
      : operation === 'score_reward'
        ? await completeScoreReward({ userId: session.user.id, referenceId: String(body.referenceId || '').slice(0, 128), score: Number(body.score) })
        : null;
    if (!profile) return json(res, 400, { error: 'invalid_operation' });
    return json(res, 200, { profile });
  } catch (error) {
    return json(res, error instanceof SyntaxError ? 400 : error.status || 500, {
      error: error instanceof SyntaxError ? 'invalid_json' : error.code || 'economy_transaction_failed'
    });
  }
}
