# WhatsApp AI Chatbot-as-a-Service

Multi-tenant platform: onboard a business, feed it knowledge (FAQs/docs), and
let a Claude-powered bot answer its customers on WhatsApp — with human
handoff when needed.

- **Backend**: Python FastAPI + MongoDB (Motor) — `backend/`
- **Frontend**: Next.js dashboard — `frontend/`
- **LLM**: Anthropic Claude (chat) + Voyage AI (embeddings for RAG)
- **RAG storage**: MongoDB Atlas Vector Search

## 1. Prerequisites

- Python 3.12+, Node 20+
- A [MongoDB Atlas](https://www.mongodb.com/atlas) cluster (free tier is fine — Atlas Vector Search requires Atlas, not a local `mongod`)
- An [Anthropic API key](https://console.anthropic.com/)
- A [Voyage AI API key](https://dash.voyageai.com/) (free tier) — used for embeddings since Anthropic has no embeddings endpoint
- A [Meta Developer](https://developers.facebook.com/) app with the WhatsApp product added (for the Cloud API)
- [ngrok](https://ngrok.com/) (or similar) to expose your local backend to Meta's webhook during development

## 2. MongoDB Atlas setup

1. Create a free cluster, create a database user, and allow your IP (or `0.0.0.0/0` for local dev).
2. Copy the connection string into `backend/.env` as `MONGODB_URI`.
3. Once you've created at least one document in `knowledge_chunks` (see step 5), go to **Atlas Search → Create Search Index → Vector Search** and create an index named `knowledge_vector_index` on the `knowledge_chunks` collection:

```json
{
  "fields": [
    {
      "type": "vector",
      "path": "embedding",
      "numDimensions": 1024,
      "similarity": "cosine"
    },
    {
      "type": "filter",
      "path": "tenant_id"
    }
  ]
}
```

(`numDimensions: 1024` matches Voyage's `voyage-3.5` model — adjust if you change `VOYAGE_EMBEDDING_MODEL`.)

## 3. Meta WhatsApp Cloud API setup

1. In your Meta app, add the **WhatsApp** product. This gives you a test phone number, a `phone_number_id`, and a temporary access token (generate a permanent one via a System User for production).
2. You'll enter the `phone_number_id` and access token per-tenant in the dashboard onboarding form (step 6) — each client business gets its own.
3. Under **WhatsApp → Configuration**, set the webhook URL to `https://<your-ngrok-or-domain>/webhook` and the verify token to whatever you set as `WHATSAPP_VERIFY_TOKEN` in `backend/.env`. Subscribe to the `messages` field.

## 4. Backend setup

```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in MONGODB_URI, ANTHROPIC_API_KEY, VOYAGE_API_KEY, WHATSAPP_VERIFY_TOKEN, JWT_SECRET
uvicorn app.main:app --reload
```

- API docs: http://localhost:8000/docs
- Health check: http://localhost:8000/health
- Expose locally for Meta's webhook: `ngrok http 8000`, then set that URL in Meta's webhook config (step 3).

## 5. Frontend setup

```bash
cd frontend
npm install
cp .env.local.example .env.local   # NEXT_PUBLIC_API_URL, defaults to http://localhost:8000
npm run dev
```

Dashboard at http://localhost:3000.

## 6. Onboard your first client

1. Go to http://localhost:3000/signup.
2. Enter the business name, the `phone_number_id` and access token from Meta (step 3), and your own login email/password. This creates the tenant + your dashboard login in one step.
3. Under **Knowledge**, paste FAQs/policies as text snippets or upload a PDF/TXT doc — these get chunked, embedded via Voyage, and stored for retrieval.
4. Send a WhatsApp message to the client's number from your phone — it should hit `/webhook`, retrieve relevant knowledge, and reply via Claude. Watch it appear under **Conversations**.
5. To simulate a customer asking for a human, send a message containing "agent" or "human" — the conversation flips to human mode and stops auto-replying (toggle it back from the conversation thread page).

## Notes / next steps for production

- The `POST /tenants` endpoint (onboarding) is intentionally open — add an agency-level API key or invite-code check before exposing this publicly.
- WhatsApp access tokens are stored in plaintext in `tenants` for simplicity — encrypt at rest before handling real client credentials.
- Outbound messages outside the 24h customer-service window require an approved Meta message template, not free-form text — `services/whatsapp_client.py` only implements free-form text.
- No outbound notification (email/SMS) on human handoff yet — currently the dashboard conversation list is the only signal; add one before relying on this for real support SLAs.
