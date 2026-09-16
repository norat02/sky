import { requireDatabase } from '../api/_db.mjs';

const CHARACTER_IDS = new Set(['swallow', 'crow', 'dove', 'swift', 'owl', 'hawk', 'crane', 'kingfisher']);

function assertUserId(userId) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(userId || ''))) {
    const error = new Error('invalid_user_id');
    error.code = 'invalid_user_id';
    error.status = 400;
    throw error;
  }
}

function assertScore(score) {
  if (!Number.isSafeInteger(score) || score < 0 || score > 100000) {
    const error = new Error('invalid_score');
    error.code = 'invalid_score';
    error.status = 400;
    throw error;
  }
}

function assertReferenceId(referenceId) {
  if (typeof referenceId !== 'string' || referenceId.length < 1 || referenceId.length > 128) {
    const error = new Error('invalid_reference_id');
    error.code = 'invalid_reference_id';
    error.status = 400;
    throw error;
  }
}

export async function completeScoreReward({ userId, referenceId, score }) {
  assertUserId(userId);
  assertReferenceId(referenceId);
  assertScore(score);
  const db = requireDatabase();
  const { data, error } = await db.rpc('complete_score_reward', {
    p_user_id: userId,
    p_reference_id: referenceId,
    p_score: score
  });
  if (error) throw mapEconomyError(error);
  if (!data) throw new Error('economy_transaction_failed');
  return getPlayerProfile(userId);
}

export async function unlockCharacter({ userId, character }) {
  assertUserId(userId);
  if (!CHARACTER_IDS.has(character)) {
    const error = new Error('invalid_character');
    error.code = 'invalid_character';
    error.status = 400;
    throw error;
  }
  const db = requireDatabase();
  const { data, error } = await db.rpc('unlock_character', {
    p_user_id: userId,
    p_character: character
  });
  if (error) throw mapEconomyError(error);
  if (!data) throw new Error('economy_transaction_failed');
  return getPlayerProfile(userId);
}

export async function getPlayerProfile(userId) {
  assertUserId(userId);
  const { data, error } = await requireDatabase()
    .from('player_profiles')
    .select('user_id,display_name,best_score,flights,coins,unlocked_characters,selected_character,selected_map,language,volume,muted,updated_at')
    .eq('user_id', userId)
    .single();
  if (error) throw mapEconomyError(error);
  return data;
}

function mapEconomyError(error) {
  const message = String(error?.message || '');
  const mapped = new Error(message || 'economy_transaction_failed');
  mapped.status = message.includes('insufficient_coins') ? 409 : message.includes('invalid_character') ? 400 : 500;
  mapped.code = message.includes('insufficient_coins') ? 'insufficient_coins' : message.includes('invalid_character') ? 'invalid_character' : 'economy_transaction_failed';
  return mapped;
}

export { CHARACTER_IDS };
