# Speak with AI API

Backend service for the Speak with AI app on Even Realities G2 glasses. The client performs speech-to-text locally and sends only the transcript here. This service validates the request, calls the MundusX OpenAI-compatible API, and returns compact conversation guidance.

## Local development

Requirements: Node.js 20 or newer.

```bash
npm install
copy .env.example .env.local
npm run dev
```

The default configuration uses mock replies, so no API key or AI usage is required. The server starts at `http://127.0.0.1:8787`.

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
MUNDUSX_BASE_URL=https://mundusx.ai/v1
MUNDUSX_API_KEY=your-server-only-key
MUNDUSX_MODEL=your-model-name
```

The service calls the OpenAI-compatible `POST /chat/completions` endpoint. Never expose `MUNDUSX_API_KEY` in the Vite client or use a `VITE_` prefix for it.

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
