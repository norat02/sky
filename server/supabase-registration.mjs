function registrationError(code, status = 500) {
  const error = new Error(code);
  error.code = code;
  error.status = status;
  return error;
}

export async function registerSupabaseUser({ email, password, adminClient }) {
  if (!adminClient?.auth?.admin?.createUser) throw registrationError('supabase_auth_not_configured', 500);
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const result = await adminClient.auth.admin.createUser({
    email: normalizedEmail,
    password,
    email_confirm: false,
  });
  if (result.error) {
    const status = Number(result.error.status || result.error.code) === 422
      || /already registered|already exists/i.test(String(result.error.message || ''));
    throw registrationError(status ? 'email_already_exists' : 'supabase_registration_failed', status ? 409 : 502);
  }
  if (!result.data?.user?.id) throw registrationError('supabase_registration_failed', 502);
  return { created: true, emailConfirmationRequired: true };
}
