# DineIQ database schemas

`sqlite_schema.sql` is the runtime schema used by `DataManagementService`. The app initializes it in `runtime/dineiq.sqlite3` on first data request. Set `DINEIQ_DATA_DB` to a persistent path before starting the service. The database contains locations, restaurants, menu categories and items, pricing history, anonymized customers, promotions, orders, order lines, ratings, inventory, and wastage records.

The customers table contains no direct personal identifiers. User accounts are stored separately in the authentication database (`DINEIQ_AUTH_DB`) with salted password hashes. Local runtime databases and session keys are excluded from source control.

`schema.sql` is the relational DDL companion for deployments that map the same model to another SQL database. Confirm data types and identity syntax for the chosen database before applying it. The Flask service itself currently uses SQLite and does not connect to an external database.
