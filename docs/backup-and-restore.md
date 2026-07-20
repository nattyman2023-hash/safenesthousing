# Backup and restore

Back up the production database on a schedule approved by the organisation, retain encrypted copies in a separate location, and test restores regularly. Back up private object storage metadata and files together; database-only restores can leave document references unusable.

For SQLite local development, stop the app before copying the database file. For production PostgreSQL, use a consistent database-native dump and verify it by restoring into an isolated environment. Record backup time, scope, encryption, retention, restore owner, and test result. Never put production backups in the public web root.
