# Archived Texas content audits

These tests validate particular Texas districts' source labels, events, statistics,
and editorial wording. They do not describe Florida publication requirements.
The shared calendar, comparison, schema, search, source-validation, and export
behavior continues to be tested by the default `pnpm test` suite.

Run historical audits separately with `pnpm test:legacy`. The copied snapshots
already contain differences between some stored statistical explanations and the
current statistics generator, and some outdated IDs/labels. These audits are
preserved for reference and are not part of the Florida publish gate. Do not alter
Florida functionality to match historical Texas wording or publish these fixtures.
