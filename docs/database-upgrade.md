# Rightsly database upgrade

The Drizzle schema in `lib/db/src/schema/` is the database source of truth. The
application must not start against an environment until that environment's
schema reconciliation has completed successfully.

## Replit-managed PostgreSQL

Replit applies schema changes at two supported points:

1. **After a task merge**, `scripts/post-merge.sh` runs the read-only integrity
   preflight, applies the Drizzle schema to the development database, then runs
   the preflight again.
2. **During Publish**, Replit compares development and production, presents the
   SQL diff and any rename/destructive-change confirmations, and applies the
   approved diff to production before the new release serves traffic.

For this release, Publish is a required deployment step. Review and approve the
database diff containing:

- `contract_seasons` and its restrictive season relationship;
- `contracts.rights_in_social_accounts`;
- revenue period/schedule columns and schedule-key uniqueness;
- restrictive `contract_content → content_items`;
- unique approval and notification dedupe indexes.

Do not add `drizzle-kit push`, custom production SQL, or schema DDL to the
deployment build/start command. If Publish reports invalid existing data, stop
the release, inspect the reported rows, resolve them with stakeholder approval,
rerun the development preflight, and Publish again.

## Self-hosted Ubuntu

Use a maintenance window and a current database backup:

1. Stop the API process so no contract/content writes can race the upgrade.
2. Set `DATABASE_URL` to the target database.
3. Run `pnpm --filter @workspace/db run preflight`.
4. Resolve every non-zero orphan/duplicate finding; do not delete valid business
   records merely to satisfy a constraint.
5. Review and apply the Drizzle schema with
   `pnpm --filter @workspace/db run push`.
6. Run `pnpm --filter @workspace/db run preflight` again.
7. Start the API only after both schema application and the final preflight
   succeed.

On first startup after the schema is present, the API idempotently copies any
legacy `revenue_reports.amount` value into `amount_received` where the new value
is still null. Read paths retain a compatibility fallback during that backfill.

After reconciling a non-production database, run
`pnpm --filter @workspace/db run test:integration`. The test rolls back its
fixture and verifies season/social persistence, generated revenue columns, and
restrictive title/season relationships on the reconciled schema.