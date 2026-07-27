#!/bin/bash
set -e
npm install

# Idempotent schema migration: rename trial columns, add current_package
node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL });
pool.query(\`
  DO \$\$
  BEGIN
    IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='mvp_users' AND column_name='trial_starts_at') THEN
      ALTER TABLE mvp_users RENAME COLUMN trial_starts_at TO app_starts_at;
    END IF;
    IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='mvp_users' AND column_name='trial_ends_at') THEN
      ALTER TABLE mvp_users RENAME COLUMN trial_ends_at TO valid_ends_at;
    END IF;
    ALTER TABLE mvp_users ADD COLUMN IF NOT EXISTS current_package VARCHAR(50);
    UPDATE mvp_users u SET current_package = COALESCE(
      (SELECT p.name FROM mvp_user_subscriptions s JOIN mvp_subscription_plans p ON s.plan_id = p.id
       WHERE s.user_id = u.id AND s.status = 'active' AND s.valid_date_upto >= NOW()
       ORDER BY s.valid_date_upto DESC LIMIT 1),
      'TRIAL'
    ) WHERE current_package IS NULL;
  END \$\$;
\`).then(() => { console.log('Migration done'); pool.end(); }).catch(e => { console.error('Migration error:', e.message); pool.end(); process.exit(1); });
"

npm run db:push
