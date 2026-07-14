// WhatsApp Cloud Bot — Real Estate Lead Qualification + AI replies (Ollama local / Groq cloud)
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const { Ollama } = require('ollama');
require('dotenv').config();

const ollama = new Ollama();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());

const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

// 🧠 In-memory context store per user
const userContext = new Map();

// ---------- language helpers ----------
const GREETINGS = ['hi', 'hii', 'hiii', 'hello', 'hey', 'namaste', 'start', 'menu'];
const PROPERTY_TYPES = ['flat', 'apartment', 'villa', 'plot', 'house', 'kothi', 'shop', 'office', 'land'];

const isGreeting = (text) => {
  const clean = text.replace(/[!.]/g, '').trim();
  return GREETINGS.includes(clean.replace(/\s/g, '')) || GREETINGS.includes(clean.split(/\s+/)[0]);
};
const looksLikeCity = (text) => /^[a-z\s]{3,30}$/i.test(text) && !isGreeting(text);
const looksLikeQuestion = (text) =>
  /\?/.test(text) ||
  /^(what|how|why|which|where|when|who|is|are|can|could|should|do|does|tell me|suggest|explain|kya|kaise|kaun|kitna|kidhar|batao|bata)\b/i.test(text);
const titleCase = (s) => s.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());

const findPropertyType = (text) => PROPERTY_TYPES.find((t) => new RegExp(`\\b${t}s?\\b`, 'i').test(text));
const findUsage = (text) => {
  if (/(personal|khud|own|self|living|rehna|rehne|family)/i.test(text)) return 'Personal use';
  if (/(invest|rental|resale|business)/i.test(text)) return 'Investment';
  return null;
};

// ---------- prompts ----------
const WELCOME =
  "Hey! 👋 I'm *Tanisha's Property Assistant* 🏡\n\n" +
  "I'll help you find the right property in just a few quick questions.\n\n" +
  "📍 First — *which city* are you looking to buy or rent in?";

const ASK_CITY = "📍 So, *which city* are you looking to buy or rent in?";
const askType = (city) =>
  `Great choice! *${city}* it is 🏙️\n\n` +
  "🏠 What type of property are you looking for?\n\n" +
  "• *Flat*\n• *Villa*\n• *Plot*";
const ASK_USAGE = "🎯 And is it for *personal use* or *investment*?";
const ASK_BUDGET = "💰 What's your *budget range*?\ne.g. _50L to 75L_ or _1Cr to 1.5Cr_";

const summary = (ctx) =>
  "✅ *You're all set!* Here's what I noted:\n\n" +
  `📍 City: *${ctx.city}*\n` +
  `🏠 Property: *${ctx.type}*\n` +
  `🎯 Purpose: *${ctx.usage}*\n` +
  `💰 Budget: *${ctx.budget}*\n\n` +
  "Our team will reach out with matching properties soon.\n\n" +
  "Meanwhile, ask me *anything* about real estate — home loans, localities, resale vs new — I'm happy to help! 🤖\n\n" +
  "_(Type *restart* anytime to start over)_";

// ---------- AI ----------
// Local Ollama (dev) → Groq cloud (production) → null (caller uses fallback text)
async function aiReply(messages) {
  try {
    const ai = await ollama.chat({ model: 'mistral', messages });
    return ai.message.content;
  } catch (err) {
    console.error('⚠️ Ollama unavailable:', err.message);
  }
  if (GROQ_API_KEY) {
    try {
      const r = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        { model: 'llama-3.1-8b-instant', messages, max_tokens: 300 },
        { headers: { Authorization: `Bearer ${GROQ_API_KEY}` } }
      );
      return r.data.choices[0].message.content;
    } catch (err) {
      console.error('⚠️ Groq error:', err.response?.status, err.response?.data?.error?.message || err.message);
    }
  }
  return null;
}

const systemPrompt = (ctx) =>
  `You are Tanisha's friendly real estate assistant on WhatsApp, chatting with a customer (the customer is NOT Tanisha — never address them by any name). ` +
  `Known about the customer so far: city=${ctx.city || 'unknown'}, property type=${ctx.type || 'unknown'}, purpose=${ctx.usage || 'unknown'}, budget=${ctx.budget || 'unknown'}. ` +
  `Answer questions briefly (2-4 short sentences, WhatsApp style, an emoji or two). You may use *asterisks* for bold. ` +
  `If asked something unrelated to real estate, answer helpfully but briefly. ` +
  `IMPORTANT: You cannot search listings or see actual properties — never claim you "found" properties. ` +
  `Give general guidance only (localities, loans, process, market tips); the human team shares actual listings.`;

// Answer a side-question mid-flow, then repeat the pending flow question
async function answerThenReask(ctx, userInput, pendingPrompt) {
  const content = await aiReply([
    { role: 'system', content: systemPrompt(ctx) },
    { role: 'user', content: userInput },
  ]);
  const answer = content || "Good question! 🙏 Our team can help with that in detail.";
  return `${answer}\n\n———\n${pendingPrompt}`;
}

// ---------- webhook ----------

// 🩺 Health check (Render pings this)
app.get('/', (req, res) => res.send("🤖 Tanisha's WhatsApp bot is running"));

// 🟢 Verify Webhook
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('✅ Webhook verified');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// 🔄 Handle incoming messages
app.post('/webhook', async (req, res) => {
  const message = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  const sender = message?.from;
  const userInput = message?.text?.body?.trim().toLowerCase();

  if (!sender || !userInput) return res.sendStatus(200);

  console.log(`📩 Message from ${sender}: ${userInput}`);

  // 'restart' or a greeting always starts a fresh conversation
  if (userInput === 'restart' || isGreeting(userInput)) {
    userContext.set(sender, { step: 'ask_city' });
    await sendMessage(sender, WELCOME);
    return res.sendStatus(200);
  }

  const ctx = userContext.get(sender) || { step: 'ask_city' };
  let response = '';

  switch (ctx.step) {
    case 'ask_city':
      if (looksLikeQuestion(userInput)) {
        response = await answerThenReask(ctx, userInput, ASK_CITY);
        break;
      }
      if (!looksLikeCity(userInput)) {
        response = "Hmm, that doesn't look like a city name 🤔\nPlease tell me the *city* — e.g. _Noida_, _Delhi_, _Mumbai_";
        break;
      }
      ctx.city = titleCase(userInput);
      ctx.step = 'ask_type';
      response = `${askType(ctx.city)}\n\n${ASK_USAGE}`;
      break;

    case 'ask_type': {
      // remember whichever detail the user gives, in any order
      const type = findPropertyType(userInput);
      const usage = findUsage(userInput);
      if (type) ctx.type = titleCase(type);
      if (usage) ctx.usage = usage;

      if (!ctx.type) {
        if (looksLikeQuestion(userInput)) {
          response = await answerThenReask(ctx, userInput, `🏠 Which one would you like — *Flat*, *Villa* or *Plot*?`);
        } else if (usage) {
          response = `Got it — *${usage.toLowerCase()}* ✅\n\n🏠 And which property type?\n\n• *Flat*\n• *Villa*\n• *Plot*`;
        } else {
          response = "Please pick a property type 🏠\n\n• *Flat*\n• *Villa*\n• *Plot*\n\n_(or ask me anything — e.g. \"flat vs villa?\")_";
        }
        break;
      }
      if (ctx.usage) {
        ctx.step = 'ask_budget';
        response = `Perfect 👌 *${ctx.type}* for *${ctx.usage.toLowerCase()}* — noted!\n\n${ASK_BUDGET}`;
      } else {
        // user gave only the type (forgot the usage part) — ask it separately
        ctx.step = 'ask_usage';
        response = `Nice, a *${ctx.type}* 👌\n\n${ASK_USAGE}`;
      }
      break;
    }

    case 'ask_usage': {
      const usage = findUsage(userInput);
      const newType = findPropertyType(userInput);
      if (newType) ctx.type = titleCase(newType); // user changed their mind about the type
      if (!usage) {
        if (looksLikeQuestion(userInput)) {
          response = await answerThenReask(ctx, userInput, ASK_USAGE);
        } else {
          response = `Just so I understand better 🙂\n\n${ASK_USAGE}`;
        }
        break;
      }
      ctx.usage = usage;
      ctx.step = 'ask_budget';
      response = `Got it — *${usage.toLowerCase()}* ✅\n\n${ASK_BUDGET}`;
      break;
    }

    case 'ask_budget': {
      if (!/\d|lakh|lac|cr|crore/i.test(userInput)) {
        if (looksLikeQuestion(userInput)) {
          response = await answerThenReask(ctx, userInput, ASK_BUDGET);
        } else {
          response = `Please share a rough budget 💰\ne.g. _50L to 75L_ or _1Cr to 1.5Cr_`;
        }
        break;
      }
      ctx.budget = userInput.toUpperCase();
      ctx.step = 'done';
      response = summary(ctx);
      break;
    }

    default: {
      // 🤖 Lead qualified — free-form questions answered by AI
      const content = await aiReply([
        { role: 'system', content: systemPrompt(ctx) },
        { role: 'user', content: userInput },
      ]);
      response =
        content ||
        "Thanks for your message! 🙏 Our team will get back to you soon.\n\n_(Type *restart* to start a new property search)_";
      break;
    }
  }

  userContext.set(sender, ctx);
  await sendMessage(sender, response);
  res.sendStatus(200);
});

// 📤 Send a WhatsApp message via the Cloud API
async function sendMessage(to, body) {
  console.log(`💬 Reply to ${to}: ${body.slice(0, 80).replace(/\n/g, ' ')}...`);
  try {
    await axios.post(
      `https://graph.facebook.com/v25.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body },
      },
      {
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (err) {
    console.error('⚠️ WhatsApp send failed:', err.response?.status, err.response?.data?.error?.message || err.message);
  }
}

app.listen(PORT, () => {
  console.log(`🚀 Bot is live at http://localhost:${PORT}`);
});
