import { authenticate, json } from './_security.mjs';
import { requireDatabase } from './_db.mjs';

const characters = new Set(['swallow', 'crow', 'dove', 'swift', 'owl', 'hawk', 'crane', 'kingfisher']);
export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });
  try {
    const session = await authenticate(req);
    if (!session) return json(res, 401, { error: 'unauthorized' });
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const operation = String(body.operation || '');
    const db = requireDatabase();
    let result;
    if (operation === 'unlock_character') {
      const character = String(body.character || '');
      if (!characters.has(character)) return json(res, 400, { error: 'invalid_character' });
      result = await db.rpc('unlock_character', { p_user_id: session.user.id, p_character: character });
    } else if (operation === 'score_reward') {
      const referenceId = String(body.referenceId || '').slice(0, 128);
      const score = Number(body.score);
      if (!referenceId || !Number.isSafeInteger(score) || score < 0 || score > 100000) return json(res, 400, { error: 'invalid_reward' });
      result = await db.rpc('complete_score_reward', { p_user_id: session.user.id, p_reference_id: referenceId, p_score: score });
    } else return json(res, 400, { error: 'invalid_operation' });
    if (result.error) {
      const message = String(result.error.message || '');
      if (message.includes('insufficient_coins')) return json(res, 409, { error: 'insufficient_coins' });
      if (message.includes('invalid_character')) return json(res, 400, { error: 'invalid_character' });
      return json(res, 500, { error: 'economy_transaction_failed' });
    }
    if (!result.data) return json(res, 500, { error: 'economy_transaction_failed' });
    const profile = await db.from('player_profiles').select('*').eq('user_id', session.user.id).single();
    if (profile.error) return json(res, 500, { error: 'economy_profile_read_failed' });
    return json(res, 200, { profile: profile.data });
  } catch (error) {
    return json(res, error instanceof SyntaxError ? 400 : 500, { error: error instanceof SyntaxError ? 'invalid_json' : 'economy_transaction_failed' });
  }
}
