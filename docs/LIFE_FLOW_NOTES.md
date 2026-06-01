# Life Flow Notes

Date: 2026-06-01

## What Life Flow Tracks

Life Flow is a light owner-only rhythm for Adib.

Route:

- `/app/life`

It tracks:

- mood
- energy
- wake time
- sleep time
- estimated sleep duration
- gym done
- outdoor sports done
- no useless scrolling
- sleep quality
- notes
- last 7 days mini history

It does not track calories, medical data, weight, macros or strict health metrics.

## Owner-Only Rule

Life Flow is owner-only.

Managers must not see owner Life Flow. The page uses owner access checks, and Today page only shows the Life Flow mini card to the owner.

## Sleep Duration Logic

Sleep duration is calculated only when it is clear.

Logic:

- If today has wake time and today sleep time is before wake time, use those.
- Otherwise, if yesterday has sleep time before today wake time, use yesterday sleep and today wake.
- If the order is unclear, show `Not clear yet` instead of guessing.

Times are stored as timestamps and displayed in Asia/Kolkata.

## AI Context Behavior

AI Secretary receives Life Flow context only for owner:

- mood
- energy
- wake marked or not
- gym status
- sports status
- sleep marked or not
- estimated sleep duration if clear

Life Flow is not included for managers.

## Task Integration

Life Flow conservatively marks matching private owner tasks done when:

- gym is marked done and a private task due today contains `gym`
- outdoor sports is marked done and a private task due today contains `sports` or `outdoor`
- sleep is marked now and a private task due today contains `sleep`

Only pending, in-progress or waiting private tasks are touched.

## Known Limitations

- No charts yet.
- No weekly Life Flow summary yet.
- No reminder generation specifically for Life Flow yet.
- Sleep duration is intentionally conservative.
- If sleep is marked after wake on the same day, duration may wait until the next morning to become clear.

## Next Recommended Step

Run a final audit/polish pass and prepare deployment. After that, Life Flow can be connected to AI Secretary for gentle weekly planning.
