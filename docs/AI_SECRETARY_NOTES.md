# AI Secretary — Technical Notes

## Gemini Integration

### Default Model
The AI Secretary uses **`gemini-2.5-flash`** by default. This is a stable, low-cost Gemini model suitable for business assistant use cases.

### Model Override
Set `GEMINI_MODEL` in `.env.local` or Vercel environment variables to use a different model:

```
GEMINI_MODEL=gemini-2.5-flash-lite
```

If not set, the default `gemini-2.5-flash` is used.

### Fallback Logic
If the configured model returns HTTP 404 (model not found/unavailable), the system automatically tries fallback models in this order:

1. `gemini-2.5-flash` (default)
2. `gemini-2.5-flash-lite`
3. `gemini-flash-latest`
4. `gemini-2.0-flash`

Fallback only triggers on 404 errors. Auth errors (401/403), rate limits (429), and other failures are NOT retried with different models.

### Health Check
Run the Gemini health check to verify your API key and model:

```bash
npm run check:gemini
```

This will:
- Verify `GEMINI_API_KEY` is set (without printing it)
- List available Gemini models that support `generateContent`
- Test the configured model with a simple prompt
- Try fallback models if the primary returns 404
- Exit with code 0 (healthy) or 1 (broken)

### Common Issues

| Error | Cause | Fix |
|---|---|---|
| 404 model not found | Model name is wrong or deprecated | Run `npm run check:gemini` to find working models |
| 401/403 unauthorized | API key is invalid or disabled | Regenerate key at console.cloud.google.com |
| Empty response | Model returned no candidates | Usually transient — retry |
| "API key is not configured" | `GEMINI_API_KEY` not in environment | Add to `.env.local` or Vercel env vars |

### Cost Control
- AI calls are **manual only** — the owner must explicitly send a message
- No background/scheduled AI calls
- `maxOutputTokens: 700` limits per-call cost
- `temperature: 0.35` keeps responses focused
- Context is capped at 14,000 characters
- Gemini Flash models are the lowest-cost tier

### API Endpoint
```
POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
```

### Context Sent to AI
Each AI Secretary call builds a real-time context from:
- Current India time
- Active stores and their status
- Today's checklist completion
- Yesterday's sales status
- This month's sales summaries
- Staff rankings
- Stock pulse (slow/dead/fast-low candidates)
- Open manager updates
- Task summary
- Salary/stock report status
- Active AI memories
- Owner Life Flow (mood, energy, gym, etc.)
- Weekly audit (on Mondays or when asked)
