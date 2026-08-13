# Speak with AI API

Backend service for the Speak with AI app on Even Realities G2 glasses. The client performs speech-to-text locally and sends only the transcript here. This service validates the request, calls the MundusX OpenAI-compatible API, and returns compact conversation guidance.

## Local development

Requirements: Node.js 20 or newer.

```bash
npm install
copy .env.example .env.local
npm run dev
```

The default configuration uses mock replies. The server starts at `http://127.0.0.1:8787`.

```bash
curl http://127.0.0.1:8787/health
curl -X POST http://127.0.0.1:8787/api/glasses/conversation \
  -H "Content-Type: application/json" \
  -d '{"transcript":"Das Wetter ist heute wirklich schön.","conversationLanguage":"de","userLanguage":"en"}'
```

## Live MundusX mode

Set these values in `.env.local`:

```dotenv
USE_MOCK_MUNDUSX=false
MUNDUSX_BASE_URL=https://mundusx.ai
MUNDUSX_API_MODE=speakai
```

SpeakAI mode submits validated conversation requests to `POST /v1/chat/completions` with `mode: "speakai"`, then polls `GET /v1/jobs/{request_id}`. Generic `jobs` and `chat` modes remain available for compatibility. Neither credentials nor a model are required. `MUNDUSX_API_KEY` and `MUNDUSX_MODEL` remain optional settings for future compatibility. Never expose an API key in the Vite client or use a `VITE_` prefix for it.

## API

### `POST /api/glasses/conversation`

Request:

```json
{
  "transcript": "German speech transcribed on the client",
  "conversationLanguage": "de",
  "userLanguage": "en",
  "recentTurns": []
}
```

The response identifies the speech act, topic, and meaning, then supplies exactly three German replies: supportive, conversational continuation, and an alternative perspective. Each reply also includes an English meaning and a short purpose label for the HUD.
