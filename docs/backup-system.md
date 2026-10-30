# Smart Broker USA — Firestore Backup and Recovery System

## Live verification status

**Verified in the Google Cloud Console on October 14, October 15, and October 29, 2026.** No backup, retention, or point-in-time recovery setting was changed during any verification.
The live Firestore database has active scheduled backups and point-in-time recovery. The prior documentation understated the protection in place: it listed only daily backups and an unverified approximate run time.

## Live protection policy

| Protection | Live setting | What it provides |
|---|---:|---|
| Point-in-time recovery (PITR) | Enabled; **7 days** | Recover a database to a point in the last seven days, subject to Firestore’s recovery process. |
| Daily scheduled backups | Enabled; **30-day retention** | One restorable daily backup per day, retained for 30 days. |
| Weekly scheduled backups | Enabled; **Sunday; 98-day retention** | A longer-retained weekly recovery point. |
| Firestore database | `(default)` | Production Smart Broker USA database. |
| Project | `smart-broker-usa` | Google Cloud / Firebase production project. |
| Backup location | `nam5` | US multi-region backup location shown in the console. |

> **Important:** Google charges for both scheduled backup storage and PITR storage. The existing settings are already active; no new billing configuration was applied during the October 14 verification.

## Current recovery evidence
The fresh **October 29, 2026** read-only console check showed that scheduled backups continue to advance: the newest daily snapshot was created at **7:32:38 AM GMT-5** and expires **November 28, 2026 at 6:32:38 AM GMT-6**. Consecutive preceding daily snapshots appeared on October 28 and October 27. The October 25 snapshot also has a Sunday weekly-retention copy expiring **January 31, 2027**, confirming the longer weekly schedule is active. The PITR panel reported an earliest available version time of **October 22, 2026 at 7:23:00 PM UTC-5**.

The earlier October 15 console check had likewise shown consecutive retained snapshots, including the October 15 daily backup created at 5:35:02 AM GMT-5.
This confirms the recovery service is currently creating and retaining backups. It does **not** retroactively recreate a transaction that was deleted before the relevant recovery window or backup availability.

## Historical schedule reference

The following schedule resource appears in previous project records. It was not independently revalidated by resource ID during the October 14 console inspection, so live settings above—not this historical identifier—are authoritative.

| Field | Historical value |
|---|---|
| Daily schedule ID | `32017554-2cb3-4be9-843b-7c243caeb2f7` |
| Full resource name | `projects/smart-broker-usa/databases/(default)/backupSchedules/32017554-2cb3-4be9-843b-7c243caeb2f7` |
| Historical creation time | `2026-06-02T20:30:47Z` |

## Recovery boundaries

1. **Scheduled backup restore creates a new Firestore database.** It does not overwrite the active production database.
2. Restoring an entire database is a major operational action: application configuration, integration testing, and data reconciliation are required before any switch to a restored database.
3. For a single missing transaction, first look for an **archived** canonical transaction. The application now archives transactions by default instead of hard-deleting them.
4. When a missing transaction is not archived, use the relevant backup/PITR recovery source to inspect and reconstruct only verified data through the canonical application workflow. Do not write partial guesses directly to Firestore.

## Where to inspect recovery status

**Google Cloud Console:**

1. Open Google Cloud Console for project `smart-broker-usa`.
2. Open **Firestore** → **Disaster Recovery**.
3. Confirm the PITR setting, daily/weekly retention, and that recent backup snapshot times advance.

## Command-line reference

These commands require an authenticated Google Cloud account with the applicable Firestore permissions.

```bash
# List backup schedules for the production default database
gcloud firestore backups schedules list --database="(default)" --project=smart-broker-usa

# List retained backup artifacts
gcloud firestore backups list --project=smart-broker-usa

# View the database's scheduled backup / disaster recovery details in the Console
# Google Cloud Console → Firestore → Disaster Recovery
```

## Monitoring and operating procedure

The project has historical documentation for a backup-failure alert, but the October 14 review verified backup creation in the Firestore Console rather than revalidating the notification channel or alert policy IDs. Treat the Disaster Recovery console as the current source for backup health until monitoring is independently checked.

Recommended operational check:

- Monthly: verify the latest daily backup is less than 36 hours old and review PITR/retention values.
- Quarterly: perform a written restore-readiness review without restoring production data.
- Before a destructive cleanup: use the application’s archive path, supply a clear reason, and verify the transaction’s archive audit event.

## Cost and change policy

Do not reduce retention, disable PITR, or create an additional backup schedule without an explicit business decision. Those changes can reduce recoverability or change Google Cloud storage costs.
