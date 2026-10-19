# Historical regression fixtures

`districts/` and `ics/` preserve the copied project's official Texas calendar
examples for the existing calendar, comparison, and export regression tests.
They are not Florida calendar records. The publisher brand and domain in these
fixtures follow this project's configuration; district names and dates retain
the original test scenarios.

Production reads only `server/data/districts/records/*.json`. Never copy these
fixtures into that directory or `public/ics/` to populate the Florida website.

District-specific content audits live in `test/legacy/` and can be run separately
with `pnpm test:legacy`; they are not Florida publication checks. Shared behavior
regressions remain in the default test suite.
