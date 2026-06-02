# Smart Broker USA — Automated Backup System

## Overview

Automated daily Firestore backups using Google Cloud's native scheduled backup feature. Backups are managed entirely by the Firestore service — no Cloud Scheduler, Cloud Functions, or custom scripts are required. The schedule runs continuously until explicitly deleted.

## Schedule

| Setting | Value |
|---|---|
| Frequency | Daily |
| Approximate time | ~8:30 PM Central (20:30 UTC) |
| Retention | 30 days (older backups auto-deleted by Google) |
| Database | `(default)` |
| Project | `smart-broker-usa` |
| Location | `nam5` (US multi-region) |

## Backup Schedule Resource

| Field | Value |
|---|---|
| Schedule ID | `32017554-2cb3-4be9-843b-7c243caeb2f7` |
| Full resource name | `projects/smart-broker-usa/databases/(default)/backupSchedules/32017554-2cb3-4be9-843b-7c243caeb2f7` |
| Created | 2026-06-02T20:30:47 UTC |
| Retention | 2592000s (30 days) |
| Recurrence | `dailyRecurrence` |

## Where Backups Are Stored

Google Cloud-managed storage (internal to the Firestore service). No GCS bucket is required or created.

Backups appear in:

- **Firebase Console** → Firestore Database → **Backups** tab
- **Command line:** `gcloud firestore backups list`

## Monitoring

| Setting | Value |
|---|---|
| Alert email | jim@keatyrealestate.com |
| Notification channel | `projects/smart-broker-usa/notificationChannels/1879317168672551501` |
| Alert policy | **Firestore Backup Failure Alert** |
| Alert policy resource | `projects/smart-broker-usa/alertPolicies/8350581705698710369` |
| Alert trigger | No backup storage metric detected in 23.5 hours |

> **Note on alert window:** Google Cloud Monitoring's `conditionAbsent` (metric absence) alerts have a maximum detection window of 23h30m. The alert is configured at this maximum, which means it will fire if a backup is missed on any given day. Because the backup runs daily, a missed backup will be detected and reported within approximately 24 hours.

## How to View Backups

**Firebase Console:**
Firebase Console → Firestore Database → Backups tab

**Command line:**
```bash
gcloud firestore backups list
```

## How to Manually Trigger a Backup (if needed)

```bash
gcloud firestore backups create --database="(default)"
```

## How to Restore From a Backup

> **WARNING:** Restoring creates a **NEW** Firestore database. It does not overwrite the existing database. To use a restored backup, you must point the application at the new database name.

**Steps:**

1. List available backups:
   ```bash
   gcloud firestore backups list
   ```

2. Restore (replace `BACKUP_ID` and choose a new database name):
   ```bash
   gcloud firestore databases restore \
     --source-backup=BACKUP_ID \
     --destination-database=DATABASE_NAME
   ```

3. Verify the restored database, then update the app's Firebase config to point at it if needed.

## Estimated Monthly Cost

Under $1/month for storage of 30 daily backups of a ~13 MB database. Google charges for backup storage at standard Firestore rates.

## Manual Off-Google Copy (Recommended)

Once a week, download the most recent backup to a non-Google location (laptop, external drive) for true off-cloud safety. This protects against accidental project deletion or Google account issues.

## Schedule Management Commands

```bash
# List all backup schedules
gcloud firestore backups schedules list --database="(default)"

# Delete a schedule (stops future backups; existing backups remain until their retention expires)
gcloud firestore backups schedules delete 32017554-2cb3-4be9-843b-7c243caeb2f7 \
  --database="(default)"

# Update retention period
gcloud firestore backups schedules update 32017554-2cb3-4be9-843b-7c243caeb2f7 \
  --database="(default)" \
  --retention=NEW_DURATION

# List existing backups
gcloud firestore backups list

# View alert policy
gcloud alpha monitoring policies describe 8350581705698710369 --project=smart-broker-usa
```
