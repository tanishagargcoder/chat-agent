// WhatsApp Cloud Bot — Real Estate Lead Qualification + Mistral (Ollama) AI replies
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const { Ollama } = require('ollama');
require('dotenv').config();

const ollama = new Ollama();

const app = express();
const PORT = 3000;

app.use(bodyParser.json());

const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

// 🧠 In-memory context store per user
const userContext = new Map();

const GREETINGS = ['hi', 'hii', 'hiii', 'hello', 'hey', 'namaste', 'start', 'menu'];

const isGreeting = (text) => {
  const clean = text.replace(/[!.]/g, '').trim();
  return GREETINGS.includes(clean.replace(/\s/g, '')) || GREETINGS.includes(clean.split(/\s+/)[0]);
};
const looksLikeCity = (text) => /^[a-z\s]{3,30}$/i.test(text) && !isGreeting(text);
const titleCase = (s) => s.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());

const WELCOME =
  "Hey! 👋 I'm *Tanisha's Property Assistant* 🏡\n\n" +
  "I'll help you find the right property in just a few quick questions.\n\n" +
  "📍 First — *which city* are you looking to buy or rent in?";

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
      if (!looksLikeCity(userInput)) {
        response = "Hmm, that doesn't look like a city name 🤔\nPlease tell me the *city* — e.g. _Noida_, _Delhi_, _Mumbai_";
        break;
      }
      ctx.city = titleCase(userInput);
      ctx.step = 'ask_type';
      response =
        `Great choice! *${ctx.city}* it is 🏙️\n\n` +
        "🏠 What type of property are you looking for?\n\n" +
        "• *Flat*\n• *Villa*\n• *Plot*\n\nAnd is it for _personal use_ or _investment_?";
      break;

    case 'ask_type':
      ctx.type = titleCase(userInput);
      ctx.step = 'ask_budget';
      response = "Perfect 👌\n\n💰 What's your *budget range*?\ne.g. _50L to 75L_ or _1Cr to 1.5Cr_";
      break;

    case 'ask_budget': {
      ctx.budget = userInput.toUpperCase();
      ctx.step = 'done';
      response =
        "✅ *You're all set!* Here's what I noted:\n\n" +
        `📍 City: *${ctx.city}*\n` +
        `🏠 Property: *${ctx.type}*\n` +
        `💰 Budget: *${ctx.budget}*\n\n` +
        "Our team will reach out with matching properties soon.\n\n" +
        "Meanwhile, ask me *anything* about real estate — home loans, localities, resale vs new — I'm happy to help! 🤖\n\n" +
        "_(Type *restart* anytime to start over)_";
      break;
    }

    default: {
      // 🤖 Lead qualified — free-form questions answered by Mistral (runs locally via Ollama)
      try {
        const ai = await ollama.chat({
          model: 'mistral',
          messages: [
            {
              role: 'system',
              content:
                `You are Tanisha's friendly real estate assistant on WhatsApp. ` +
                `The user is a qualified lead: city=${ctx.city || 'unknown'}, property type=${ctx.type || 'unknown'}, budget=${ctx.budget || 'unknown'}. ` +
                `Answer real estate questions briefly (2-4 short sentences, WhatsApp style, use an emoji or two). ` +
                `You may use *asterisks* for bold. If asked something unrelated to real estate, answer helpfully but briefly.`,
            },
            { role: 'user', content: userInput },
          ],
        });
        response = ai.message.content;
      } catch (err) {
        console.error('⚠️ Ollama error:', err.message);
        response =
          "Thanks for your message! 🙏 Our team will get back to you soon.\n\n_(Type *restart* to start a new property search)_";
      }
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
