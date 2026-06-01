# Salary Attendance Workflow Notes

Date: 2026-06-01

## What The Workflow Does

Salary attendance is a monthly report upload workflow for active stores:

- Go Planet
- Brand Mark

MITTY stays inactive and hidden because all store lists use active accessible stores only.

## Schedule

- Salary attendance due day: 1st of every month
- Salary day: 3rd of every month
- Period month is stored as the first date of the selected month

## Upload Behavior

Route:

- `/app/reports/salary-attendance`

Managers can upload only for their assigned active store. Owners can upload for any active store.

Allowed file types:

- `.xlsx`
- `.xls`
- `.csv`
- `.pdf`

Files are stored in the existing Supabase Storage bucket:

- `reports`

Report rows are inserted into the existing `reports` table:

- `report_type`: `salary_attendance`
- `store_id`
- `uploaded_by`
- `period_month`
- `report_date`
- `file_name`
- `file_path`
- `status`: `processed`
- `row_count`: `0`
- `summary.uploadedForMonth`
- `summary.uploadedAt`
- `summary.originalFileName`
- `summary.fileType`

## Duplicate Rule

Duplicate uploads are blocked for the same:

- store
- `report_type = salary_attendance`
- `period_month`

The UI shows:

`Salary attendance report for this store and month already exists.`

There is no replacement or delete flow yet.

## Checklist Behavior

Salary attendance appears as a required checklist item only when it is operationally due:

- on the 1st of the month
- after the 1st only if the current month report is still missing

Once uploaded after the 1st, it is hidden from the daily required checklist and does not affect normal daily completion percentage.

## Dashboard Behavior

Reports dashboard shows current month salary attendance status per accessible store:

- Uploaded
- Missing
- due day 1
- salary day 3

Today page shows:

- salary attendance due today on the 1st
- salary attendance pending after the 1st if missing
- salary day today on the 3rd
- uploaded and missing counts for the current month

Store detail pages show:

- current month uploaded/missing status
- uploaded date
- uploaded by
- file name
- recent salary attendance history

## Task Auto-Completion

When a salary attendance report is uploaded, related open tasks are conservatively marked done when they match:

- same store
- due date around the current month day 1
- status is pending, in progress, or waiting
- title/category contains `salary attendance` or `salary_attendance`

Auto reminder generation creates store-level salary attendance due reminders on the 1st.

## Not Parsed Yet

The salary attendance file is not parsed yet.

Current scope stores only:

- the file
- report status
- basic metadata

Detailed attendance parsing and salary calculations can come later.

## Next Recommended Step

Build monthly stock report upload. Stock upload unlocks slow/dead stock, category decisions, and store-level stock discipline.
