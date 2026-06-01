# Manager Updates Notes

Date: 2026-06-01

## What Was Built

Manager Updates are now a structured feed for daily store communication.

Routes added:

- `/app/updates`
- `/app/updates/new`
- `/app/updates/[updateId]`

Pages updated:

- `/app/today`
- `/app/stores/[storeId]`

Managers can submit structured updates for:

- New stock arrived
- Customer issue
- Alteration / exchange
- Repair / maintenance
- Display / rack issue
- Cleaning issue
- Staff availability note
- Cash / account note
- Owner attention needed
- Pending work
- Other

## Owner View

Owner can see updates from all active stores: Go Planet and Brand Mark.

The updates feed supports filters for:

- store
- status
- urgency
- category
- today / this week / all

Today page now shows:

- open urgent updates count
- store-wise open update count
- latest open updates
- quick links to add or view updates

Store detail now shows:

- open update count
- urgent update count
- latest five updates
- links to add update or view store-filtered updates

## Manager Flow

Managers can create updates only for their assigned active stores.

Today page also gives managers quick links for:

- upload sales
- rack review
- cleaning review
- add update
- assigned tasks

## Task Creation Behavior

The update form can optionally create a follow-up task.

Task behavior:

- `store_id` matches the update store.
- `created_by` is the current user.
- `assigned_to` is optional.
- title is prefixed from the update title.
- description comes from update details.
- category matches the update category.
- priority maps from urgency:
  - urgent -> urgent
  - important -> high
  - normal -> normal
- status is pending.
- task is never private.
- carry forward is true.
- source is `manager` when a manager creates it, `manual` when owner creates it.
- created task is linked back through `manager_updates.created_task_id`.

## Photo Upload

Photos are optional.

Update photos upload to the existing `review-photos` bucket under:

- `manager-updates/{store-code}/{date}/...`

Update detail creates a short-lived signed photo link when a photo exists.

## Permissions

- Owner can view, create, and update manager updates for all active stores.
- Manager can view, create, and update manager updates only for assigned active stores.
- MITTY remains inactive and hidden from active update flows.
- A minimal RLS migration was added to allow managers to update assigned-store updates.

## Known Limitations

- The update edit form does not create a task after the initial update is already created.
- Photo display is a signed link, not an inline image gallery.
- Feed filters use a simple full-page submit instead of live client filtering.
- There are no comments/replies on updates yet.
- There is no notification system yet.

## Next Recommended Step

Build store daily checklist templates that combine:

- sales upload
- rack review
- cleaning review
- manager update
- customer issue follow-up
- cash/account placeholder
- staff availability note
