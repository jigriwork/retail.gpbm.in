# Review Workflow Notes

Date: 2026-06-01

## Implemented

Rack review and cleaning review workflows are now active for Go Planet and Brand Mark.

Pages added:

- `/app/reviews`
- `/app/reviews/rack`
- `/app/reviews/cleaning`

Pages updated:

- `/app/today`
- `/app/stores/[storeId]`

## Rack Review

Rack review writes to the existing `rack_reviews` table.

Fields supported:

- rack arranged
- sizes arranged
- new stock displayed
- brand display proper
- dust free
- lighting ok
- premium display ok
- remarks
- optional photo

The copy is store-aware:

- Go Planet focuses on practical rack readiness, arrangement, dust, and fast shopping.
- Brand Mark focuses on premium display, brand presentation, lighting, and complete look presentation.

## Cleaning Review

Cleaning review writes to the existing `cleaning_reviews` table.

Fields supported:

- entry clean
- floor clean
- trial room clean
- billing counter clean
- racks clean
- mirrors clean
- lights working
- AC/fan working
- staff grooming ok
- store smell fresh
- remarks
- optional photo

## Photo Upload

Optional photos upload to the existing Supabase Storage bucket:

- `review-photos`

Paths are organized by review type, store code, and review date.

## Status Visibility

Today page now shows per-store review status:

- rack review Done/Missing
- cleaning review Done/Missing
- submitted by
- submitted time
- quick submit/review links

Store detail now shows:

- today rack review status
- today cleaning review status
- recent rack review history
- recent cleaning review history

## Task Integration

When a rack or cleaning review is saved, the app conservatively marks matching tasks done when all of these are true:

- same store
- same due date
- task is not done or cancelled
- title or category contains `rack` or `cleaning`

This avoids broad task changes while connecting daily review submissions to reminders.

## Access Rules

- Owner can submit and update reviews for all active stores.
- Manager can submit and update reviews only for assigned active stores.
- MITTY remains inactive and is not shown in active review flows.
- A minimal RLS policy migration was added to allow managers to update their own assigned-store review rows.

## Known Limitations

- Changing store/date inside the form does not live-refresh the existing review preview; submitting still updates an existing matching review if one exists.
- Photo previews and signed photo viewing are not implemented yet.
- Review history is intentionally simple and shows the last five reviews.
- There is no review scoring or analytics yet.

## Next Step

Build the manager updates feed so managers can report issues, customer follow-ups, alterations/exchanges, urgent store problems, and owner action items without phone calls.
