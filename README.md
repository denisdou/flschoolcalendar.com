# flschoolcalendar.com

Independent, source-backed Florida public school district calendar directory.

## Development

This project uses pnpm 10.30.3. Do not run `npm install` over its pnpm-managed
`node_modules` directory; npm cannot interpret pnpm's linked dependency tree.

```sh
corepack enable
pnpm install
pnpm dev
```

Cloudflare's default `npx wrangler deploy` command uses npm to launch Wrangler.
The `devEngines` package-manager check therefore warns instead of failing;
dependency installation and builds still use the pinned pnpm version above.

## Calendar content maintenance

Follow the [maintenance standard](docs/calendar-content-maintenance.md) when updating
district records. Run the [content quality gate](docs/content-quality-gate.md) before
publication. Saved review context is indexed in [project memory](memory/hot-cache.md).

## Bing URL submission (IndexNow)

Run manually after deployment, using Node.js 20+. The script reads the **production**
sitemap and submits canonical URLs to Bing's [IndexNow endpoint](https://www.indexnow.org/documentation).
The deployed key file must contain `aaf9b66dcaf847a1a1922a08c27677e4` at
`https://flschoolcalendar.com/aaf9b66dcaf847a1a1922a08c27677e4.txt`.

```sh
# Preview all production URLs (no submission)
pnpm indexnow --all --dry-run

# Submit all production sitemap URLs together (up to 10,000 per request)
pnpm indexnow --all

# Submit pages whose last content edit was on this exact date
pnpm indexnow --date 2026-10-06

# Submit pages whose last content edit was on or after this date (inclusive)
pnpm indexnow --since 2026-10-06

# Preview date selection before submitting
pnpm indexnow --date 2026-10-06 --dry-run
```

Date filtering uses `contentUpdatedAt` from the production `/api/districts.json`,
not the local filesystem modification time, `verifiedAt`, or `lastOfficialRevisionAt`.
District hubs inherit the latest content edit date of their indexable calendars.
Other sitemap pages use `lastmod` if available; pages without an edit date are
excluded from date-filtered submissions. Update `contentUpdatedAt` when editing
calendar content and deploy it before running the script. Date selection matches
the stored `YYYY-MM-DD` value without timezone conversion.

The script validates the deployed key before submission, deduplicates URLs, and
stops on failures with a nonzero exit code. HTTP 200 means received; HTTP 202 means
received with key validation pending. Neither guarantees indexing. It does not
run automatically during builds or deploys.

## Florida migration and publication status

The [Florida district backlog](docs/fl-school-districts-top1000.md) contains 81 research
targets: all 67 county districts plus 14 verified non-county education agencies.
The added agencies include virtual, special, laboratory, and charter-school entities;
their official identity sources and calendar-scope checks are documented individually.
This backlog count is not a statewide NCES agency total. School operating status and
calendar dates still require school-year-specific verification before publication.
Its historical `top1000` filename is retained; rows are ordered by FLDOE district number,
not by enrollment. Alachua County Public Schools, Baker County School District,
Bay District Schools, Bradford County School District, Brevard Public Schools,
Broward County Public Schools, Calhoun County School District, Charlotte County Public Schools,
Citrus County School District, Clay County District Schools, Collier County Public Schools,
Columbia County School District, Miami-Dade County Public Schools,
The School District of DeSoto County, Dixie County School District, Flagler County
School District, Franklin County School District, Escambia County Public Schools,
Gadsden County School District, Gilchrist County School District, Glades County School District,
Gulf District Schools, Hamilton County School District, Hardee County School District,
Hendry County School District, Hernando County School District,
School Board of Highlands County, Hillsborough County Public Schools,
Holmes District Schools and Duval County Public Schools have 2026-2027 calendars.
Broward also has a 2027-2028 record; both Broward PDFs match the current official downloads.
Bay has a 2027-2028 record from
the supplied revised PDF and the district's current download link; Google Drive
file identity could not be rechecked because downloads timed out. Charlotte has separate
Traditional, Year-Round and Early Head Start pages for 2026-2027, each based on its
matching current official PDF. Citrus includes the approved 2026-2027 calendar,
seven early dismissals, current school hours and five conditional holiday make-up dates.
Clay has 2026-2027 and 2027-2028 calendars verified from the supplied final PDF exports
of its official Google documents. The final 2026-2027 report-card date is March 31.
Collier has approved 2026-2027 and 2027-2028 calendars; both PDFs match current downloads.
Its 2027-2028 student year ends June 1, and school-specific dismissal and childcare
information is kept within its verified scope.
Columbia has a 2026-2027 record verified against its scanned, stamped PDF and matching
current download, including four conditional weather reserves and separate senior endpoints.
Miami-Dade has three separate 2026-2027 program calendars: Elementary and Secondary,
Technical Colleges and Adult Education Centers, and Juvenile Justice Center. Their
current PDFs match the supplied files; the regular calendar includes grade-scoped
Wednesday release, adult education preserves planning-day class exchanges, and the
Juvenile Justice Center includes 15 scheduled Saturdays and summer grading periods.
DeSoto, Dixie and Flagler also have 2026-2027 calendars.
Duval has 2026-2027 and 2027-2028 records sourced from official HTML tables, with
no invented PDF download. The 2026-2027 calendar uses the April 7 revision and
confirmed weather-reserve rules. The later year retains Weather Day markers
without assuming their attendance status or activation order; its calculated annual
student total is withheld. Current 2026-27 bell exceptions remain year-specific.
Escambia includes three approved calendars through 2028-2029, each with 178 printed
student days and conditional break-day make-up rules. Its 2028 Christmas caption
conflicts with the half-day and grading evidence: December 20 remains a student
half day, and full-day time off starts December 21. Current campus dismissal
times are limited to verified 2026-27 schools.
Gadsden’s 2026-2027 record follows the Student Calendar in its eight-page combined
PDF, which matches the current official download. The calculated 179 attendance
dates are labeled derived; employee work-year counts are excluded. March 5’s
bus-calendar half-day wording is flagged for dismissal confirmation without
adding a third confirmed student half day. The official 2027-2028 download is
linked as a research resource, with no later-year student page inferred.
Glades has a 2026-2027 record from the supplied student PDF and the current
district-linked Google Drive entry. Its printed 178 student days reconcile with
the semester and quarter totals. Only November 23-25 are conditional hurricane
make-up dates; May 28 is the sole marked student early-release day. Google
downloads timed out even after an approved retry, so remote byte identity remains
unverified. Gilchrist has records for 2026-2027 and 2027-2028.
Gulf’s 2026-2027 record matches the current official v2 PDF and includes 180
student days, two early dismissals with no lunch and a two-day October break.
The January 4 inservice day delays the winter return to January 5. Posted
junior/senior high bell times retain their undated-source caveat and separate
Eastern and Central time zones.
Hendry’s 2026-2027 record matches its current Board-approved PDF and includes
seven early releases, an explicit January 6 return and separate spring and Easter
breaks. Its 178 student days are calculated from the dated schedule. The district’s
2026-2027 School Times sheet supplies campus-specific hours, including Clewiston
Early Learning Center’s different parent and bus dismissal times.
Highlands has a 2026-2027 record supported by the supplied PDF and a matching
official calendar image. Four student-free dates are conditional hurricane
make-up candidates, and four of six early releases may become full days. Report
cards retain their distribution windows; the planned January 11 return depends
on January 7-8 remaining student-free. Google PDF byte identity is unverified
after download timeouts. Lake Placid High’s 2026-27 bell hours remain school-scoped.
Holmes has a 2026-2027 record verified against its current color-coded and written
PDFs. The student year ends May 27, despite a conflicting May 28 endpoint in the
quarter-summary table. Its derived 180-day total reconciles with printed quarter
and semester subtotals. The written calendar supplies three report-card dates
and four school-scoped graduations; Poplar Springs bell times remain school-scoped.
Indian River has a 2026-2027 record with 40 student/family events, 22 FAQs,
five modified instructional dates and year-specific bell schedules. Its 2027-2028
calendar is retained as a fully extracted draft, matching the district folder and
PDF’s pending-approval labels, without a public year page or ICS.
There are 44 published calendar pages across 31 districts, plus one unpublished
Indian River draft. The other 50 research targets remain pending. No Texas dates
are published.
Search, comparison, district pages, official-source links, JSON APIs and ICS generation
retain their existing behavior and use the verified Florida records as they are added.

Production records belong in `server/data/districts/records/`. The copied Texas records
and ICS are regression fixtures under `test/fixtures/`, outside the content collection.
`pnpm test` checks shared functionality and Florida migration data. Texas-specific
content audits are archived under `test/legacy/` and run separately with
`pnpm test:legacy`; some copied statistical wording expectations are stale.
Historical research and the copied static output are archived in `tmp/texas-reference/`.
Use `pnpm generate` to generate fresh Florida output in `.output/public/`.

Florida defaults to `America/New_York`; set `district.timeZone` to the actual local
zone, including `America/Chicago` where appropriate in western Florida.

Set `NUXT_PUBLIC_GOOGLE_ANALYTICS_ID` and `GOOGLE_SITE_VERIFICATION` for this site
when available. Empty values disable the corresponding production tags, avoiding
reuse of the copied site's properties. Existing IndexNow commands now target this domain.
