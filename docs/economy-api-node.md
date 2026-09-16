# Node.js server-side economy transactions

The shared module `server/economy.mjs` is the only server-side caller for the Supabase RPC functions. It uses the server-only Supabase service-role client from `SUPABASE_SERVICE_ROLE_KEY`; never expose that key in Web, Android, iOS, or GitHub Actions public variables.

```js
import { completeScoreReward, unlockCharacter } from './server/economy.mjs';

const profileAfterScore = await completeScoreReward({
  userId: authenticatedUser.id,
  referenceId: runTicket,
  score: 125
});

const profileAfterUnlock = await unlockCharacter({
  userId: authenticatedUser.id,
  character: 'swallow'
});
```

`completeScoreReward` validates the UUID, reference ID, and score before calling `complete_score_reward`. The RPC locks the profile row, makes the reward idempotent by `(user_id, operation, reference_id)`, updates the balance without exceeding the maximum, and returns the complete profile.

`unlockCharacter` validates the UUID and server-owned character allowlist before calling `unlock_character`. The RPC owns the price, locks the profile row, rejects insufficient balance, records the transaction, and guarantees that the balance cannot become negative.

The deployed HTTP adapter is `POST /api/economy` and requires a Supabase Bearer access token:

```bash
curl -X POST https://sky.norat.click/api/economy \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"operation":"score_reward","referenceId":"run-ticket-id","score":125}'

curl -X POST https://sky.norat.click/api/economy \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"operation":"unlock_character","character":"swallow"}'
```

Do not call either RPC directly from the browser. Apply migrations `004_player_profiles.sql` and `005_economy_transactions.sql` first. A successful response contains the authoritative `profile`; clients should replace their local economic state with that response rather than adding or subtracting coins locally.
