# Tanisha's WhatsApp Chat Agent 🤖🏡

An AI-powered **real estate lead qualification bot** on the **WhatsApp Cloud API**. It qualifies leads through a guided conversation (city → property type → budget), then answers free-form real estate questions using a **locally-run Mistral model via Ollama** — so user conversations stay private, with no cloud AI involved.

[📱 See it in action on LinkedIn](https://www.linkedin.com/posts/tanisha-garg-a2b32b281_realestatetech-aichatbot-mistral-activity-7340805994240757760-sEkG)

## ✨ Features

- **WhatsApp Cloud API** integration — real conversations on WhatsApp
- **Guided lead qualification** — collects city, property type and budget with input validation
- **AI answers, locally** — free-form questions answered by Mistral running on your own machine via Ollama (privacy-first 🔒)
- **Context-aware** — remembers each user's answers; AI replies use their lead profile
- **WhatsApp-style formatting** — bold, italics and emojis in replies
- **Resilient** — graceful fallbacks if the AI or WhatsApp API is unavailable; `restart` works at any point

## 🧠 How it works

```
WhatsApp user ⇄ Meta Cloud API ⇄ webhook (cloudflared tunnel) ⇄ Express server
                                                                    │
                                                     lead flow (in-memory context)
                                                                    │
                                                        Ollama (Mistral, local)
```

## 🚀 Setup

### 1. Clone & install

```bash
git clone https://github.com/tanishagargcoder/chat-agent.git
cd chat-agent
npm install
```

### 2. Ollama (for AI replies)

Install [Ollama](https://ollama.com/download), then:

```bash
ollama pull mistral
```

### 3. Meta / WhatsApp Cloud API

1. Create an app at [Meta for Developers](https://developers.facebook.com/) with the **"Connect with customers through WhatsApp"** use case
2. In **WhatsApp → API Setup**: claim a test number, generate an access token, and add your phone as a recipient
3. Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

### 4. Run

```bash
node tanisha-bot.js
```

### 5. Expose the webhook

In a second terminal (using [cloudflared](https://github.com/cloudflare/cloudflared/releases) or ngrok):

```bash
cloudflared tunnel --url http://localhost:3000
```

In your Meta app's **WhatsApp → Configuration**, set:
- **Callback URL**: `https://<your-tunnel-url>/webhook`
- **Verify token**: the `VERIFY_TOKEN` from your `.env`
- Subscribe to the **messages** webhook field

Now message your test number on WhatsApp and say **hi** 👋

## 🔐 Security notes

- All credentials live in `.env` (gitignored) — never commit tokens
- Temporary Meta access tokens expire in ~24h; regenerate from the dashboard as needed

## 🛠️ Tech stack

Node.js · Express · WhatsApp Cloud API · Ollama (Mistral) · Axios
