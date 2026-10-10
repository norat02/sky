import assert from 'node:assert/strict';
import { registerSupabaseUser } from '../server/supabase-registration.mjs';

const calls = [];
const adminClient = {
  auth: {
    admin: {
      async createUser(payload) {
        calls.push(payload);
        return { data: { user: { id: 'user-1', email: payload.email } }, error: null };
      },
    },
  },
};

const result = await registerSupabaseUser({
  email: 'Alice@Example.com',
  password: 'correct horse battery staple',
  adminClient,
});
assert.deepEqual(result, { created: true, emailConfirmationRequired: true });
assert.deepEqual(calls, [{
  email: 'alice@example.com',
  password: 'correct horse battery staple',
  email_confirm: false,
}]);

await assert.rejects(
  () => registerSupabaseUser({ email: 'alice@example.com', password: 'password', adminClient: null }),
  /supabase_auth_not_configured/,
);

await assert.rejects(
  () => registerSupabaseUser({
    email: 'alice@example.com',
    password: 'correct horse battery staple',
    adminClient: { auth: { admin: { createUser: async () => ({ data: null, error: { message: 'User already registered', status: 422 } }) } } },
  }),
  (error) => error.code === 'email_already_exists' && error.status === 409,
);

console.log('Supabase registration tests: OK');
