// Enhanced WhatsApp Cloud Bot with Lead Qualification Flow
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = 3000;

app.use(bodyParser.json());

const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

// 🧠 In-memory context store per user
const userContext = new Map();

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
  const userInput = message?.text?.body?.toLowerCase();

  if (!sender || !userInput) return res.sendStatus(200);

  console.log(`📩 Message from ${sender}: ${userInput}`);

  let step = userContext.get(sender)?.step || 'greet';
  let response = '';

  switch (step) {
    case 'greet':
      response = "Hi! 👋 This is Tanisha's Bot. What city are you looking to buy/rent property in?";
      userContext.set(sender, { step: 'ask_property_type' });
      break;

    case 'ask_property_type':
      userContext.set(sender, { ...userContext.get(sender), city: userInput, step: 'ask_usage' });
      response = "Great! Are you looking for a flat, villa, or plot? And is it for personal use or investment?";
      break;

    case 'ask_usage':
      userContext.set(sender, { ...userContext.get(sender), type: userInput, step: 'ask_budget' });
      response = "Awesome. What’s your budget? (e.g. 50L to 75L)";
      break;

    case 'ask_budget':
      userContext.set(sender, { ...userContext.get(sender), budget: userInput, step: 'done' });
      response = `Thank you! We'll get back to you with properties in ${userContext.get(sender).city} under your budget of ${userInput}.`;
      break;

    default:
      response = "Thanks! If you want to start over, type 'Hi'.";
      userContext.delete(sender);
      break;
  }

  // Send message to WhatsApp
  await axios.post(
    `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: 'whatsapp',
      to: sender,
      type: 'text',
      text: { body: response },
    },
    {
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
    }
  );

  res.sendStatus(200);
});

app.listen(PORT, () => {
  console.log(`🚀 Bot is live at http://localhost:${PORT}`);
});
