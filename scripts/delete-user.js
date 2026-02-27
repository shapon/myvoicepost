#!/usr/bin/env node

const postgres = require('postgres');

const email = process.argv[2];
if (!email) {
  console.error('Usage: node scripts/delete-user.js <email>');
  process.exit(1);
}

const connectionString = process.env.SUPABASE_DATABASE_URL;
if (!connectionString) {
  console.error('SUPABASE_DATABASE_URL is not set');
  process.exit(1);
}

const sql = postgres(connectionString, { prepare: false });

(async () => {
  const users = await sql`SELECT id, username, email, stripe_customer_id, stripe_subscription_id FROM mvp_users WHERE email = ${email}`;
  if (users.length === 0) {
    console.log(`No user found with email: ${email}`);
    await sql.end();
    return;
  }

  const user = users[0];
  console.log(`Found user: ${user.username} (${user.email}), id=${user.id}`);
  console.log(`Stripe customer: ${user.stripe_customer_id || 'none'}`);
  console.log('');

  const userId = user.id;

  const tablesWithUserId = [
    'mvp_saved_texts',
    'mvp_user_subscriptions',
    'mvp_audio_log',
    'mvp_user_settings',
    'mvp_push_tokens',
    'mvp_password_reset_tokens',
    'mvp_notification_log',
  ];

  for (const table of tablesWithUserId) {
    try {
      const result = await sql.unsafe(`DELETE FROM ${table} WHERE user_id = '${userId}'`);
      if (result.count > 0) {
        console.log(`  ${table}: deleted ${result.count} rows`);
      }
    } catch (e) {
      // table doesn't exist, skip
    }
  }

  try {
    const otpResult = await sql`DELETE FROM mvp_email_otps WHERE email = ${email}`;
    if (otpResult.count > 0) {
      console.log(`  mvp_email_otps: deleted ${otpResult.count} rows`);
    }
  } catch (e) {
    // table doesn't exist, skip
  }

  await sql`DELETE FROM mvp_users WHERE id = ${userId}`;
  console.log(`  mvp_users: deleted user`);

  console.log(`\nDone. All data for ${email} has been removed (payments preserved in Stripe).`);
  await sql.end();
})().catch(async (err) => {
  console.error('Error:', err.message);
  await sql.end();
  process.exit(1);
});
