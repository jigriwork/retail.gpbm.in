# AI Secretary Notes

Date: 2026-06-01

## What AI Secretary Can Answer

AI Secretary is an owner-only chat page for calm GPBM Retail guidance.

Route:

- `/app/secretary`

It can answer questions such as:

- what needs attention today
- how Go Planet is doing
- how Brand Mark is doing
- what is not selling
- which staff performed best
- what is pending
- what to review today
- Monday weekly audit summary
- one content idea when useful

## Data Used

The AI receives compact summaries only, not raw report rows.

Context can include:

- India date/time
- owner role/name
- active stores
- daily checklist status
- yesterday sales status and latest sales amount
- this month sales summary
- staff leader summary
- stock pulse counts
- top stock categories
- urgent manager updates
- task counts
- salary attendance status
- stock report status
- weekly audit summary when Monday or requested
- active AI memories

## Gemini Integration

Gemini is called from a server action only.

Environment variables:

- `GEMINI_API_KEY`
- optional `GEMINI_MODEL`

Default model:

- `gemini-1.5-flash`

The key is never exposed to the client.

## Tone

The system prompt tells AI Secretary to be:

- calm
- practical
- concise
- non-bossy
- choice-based

It should not invent sales or stock data.

It should avoid commands such as "do this now" or "you must".

## Cost Control

Gemini is not called on dashboard load.

Gemini is called only when the owner:

- sends a chat message
- taps a quick prompt
- taps a top summary button on `/app/secretary`

Context is compact and capped before being sent.

Responses are capped with a small output token limit.

## Chat History

User and assistant messages are saved in:

- `ai_chats`

The page shows recent chat history for the owner.

## Memory Behavior

Active memories are read from:

- `ai_memories`

For v1, if the owner says "remember", "save this", or "note this", the message is saved as an active owner note.

The owner can hide/deactivate a memory from the Secretary page.

Future improvement: add confirmation before saving memories.

## Known Limitations

- Owner-only in v1.
- No streaming response yet.
- Memory save confirmation is not built yet.
- Context is summarized and may omit low-priority details.
- AI quality depends on uploaded reports and checklist data.

## Next Recommended Step

Build Life Flow or deployment/polish. A later AI Secretary version can connect business audit data with personal routines and weekly planning.
