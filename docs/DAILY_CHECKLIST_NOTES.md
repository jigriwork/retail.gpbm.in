# Daily Checklist Notes

Date: 2026-06-01

## What The Checklist Does

The daily checklist brings the working store workflows into one morning view:

- yesterday sales upload
- today's rack review
- today's cleaning review
- manager update or no-issues confirmation
- urgent update acknowledgement
- pending store tasks

Routes added:

- `/app/checklist`
- `/app/checklist/[storeId]`

Pages updated:

- `/app/today`
- `/app/stores/[storeId]`

## Go Planet Checklist Items

Go Planet focuses on practical daily readiness:

- Upload yesterday sales report
- Rack/display check
- Cleaning check
- Opening status note
- Pending customer issue
- Cash/account note placeholder
- General manager update or no issues today
- Assigned/pending store tasks

## Brand Mark Checklist Items

Brand Mark focuses on premium presentation:

- Upload yesterday sales report
- Premium rack/display check
- Cleaning/trial room check
- Staff grooming check from cleaning review
- Customer follow-up issue
- Alteration / exchange issue
- General manager update or no issues today
- Assigned/pending store tasks
- Future placeholder: premium category focus
- Future placeholder: perfume/footwear add-on focus

## Completion Logic

Required items currently are:

- Sales report uploaded for yesterday
- Rack review submitted today
- Cleaning review submitted today
- Manager update added today or explicit `No issues today`
- No urgent open update remaining

`No issues today` is implemented without schema change. It creates a resolved manager update:

- title: `No issues today`
- category: `No issues today`
- urgency: `normal`
- status: `resolved`
- details: `Store reported no special issue today.`

Checklist status:

- `Complete`: all required items are done and no urgent update is open
- `Partial`: at least one required item is done, but some required items are missing
- `Missing`: no required item is done
- `Needs attention`: urgent open update exists

## Sales Task Auto-Completion

Sales upload now conservatively marks matching generated/manual tasks done when:

- same store
- due date is today
- task status is pending, in progress, or waiting
- title/category contains `sales report` or `daily_sales`

Rack and cleaning reviews use the same conservative task completion helper.

## Known Limitations

- Checklist completion is calculated live; there is no separate checklist table or permanent daily snapshot.
- Optional item completion is informational and does not affect the required completion percentage.
- Store task links go to the main task page, not a store-filtered task tab.
- Future analytics items remain placeholders until stock/category/staff analytics exist.
- `No issues today` is a manager update convention, not a dedicated database field.

## Next Recommended Step

Build salary attendance upload or monthly stock upload. Salary attendance helps salary-day discipline; stock upload unlocks slow/dead stock and category decisions.
