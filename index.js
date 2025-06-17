// index.js
const express = require('express');
const bodyParser = require('body-parser');
const { Ollama } = require('ollama');

const app = express();
const port = process.env.PORT || 3000;
const ollama = new Ollama();

app.use(bodyParser.json());

app.post('/chat', async (req, res) => {
  const userMessage = req.body.message;

  try {
    const response = await ollama.chat({
      model: 'mistral',
      messages: [{ role: 'user', content: userMessage }]
    });

    res.json({ reply: response.message.content });
  } catch (err) {
    res.status(500).json({ error: 'Error: ' + err.message });
  }
});

app.listen(port, () => {
  console.log(`✅ Server running on port ${port}`);
});
