require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const { createClient } = require('redis');

// Environment variables: PORT, REDIS_URL
const PORT = process.env.PORT || 3000;
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

let redisClient;
let useRedis = false;
const inMemoryWelcome = {};

// Tenta conectar no Redis, senão usa memória
(async () => {
  try {
    redisClient = createClient({ url: REDIS_URL });
    await redisClient.connect();
    console.log('✅ Redis conectado');
    useRedis = true;
  } catch (err) {
    console.error('⚠️ Não foi possível conectar ao Redis, usando armazenamento em memória:', err.message);
    useRedis = false;
  }
})();

const app = express();
app.use(helmet());
app.use(morgan('combined'));
app.use(express.json());

function validatePayload(req, res, next) {
  const { text, number } = req.body;
  if (typeof text !== 'string' || typeof number !== 'string') {
    return res.status(400).json({ reply: 'Parâmetros inválidos.' });
  }
  next();
}

app.post('/webhook', validatePayload, async (req, res) => {
  const { text, number } = req.body;
  const cleaned = text.trim().toLowerCase();
  const key = `welcomed:${number}`;
  let already;
  let reply;

  try {
    if (useRedis) {
      already = await redisClient.get(key);
      if (!already) {
        await redisClient.set(key, '1', { EX: 60 * 60 * 24 });
      }
    } else {
      already = inMemoryWelcome[number];
      if (!already) {
        inMemoryWelcome[number] = true;
      }
    }

    if (!already) {
      reply = `Olá! 🤖 Você está falando com uma automação.

Comandos disponíveis:
- emails → últimos e-mails
- drive  → arquivos recentes no Drive
- ajuda  → esta mensagem`;
      return res.json({ reply });
    }

    if (cleaned.includes('emails')) {
      reply = [
        '📧 João – Reunião amanhã às 10h',
        '📧 Maria – Relatório enviado',
        '📧 Suporte – Ticket #12345 resolvido'
      ].join('\n');
    } else if (cleaned.includes('drive')) {
      reply = [
        '📁 Planejamento 2025.xlsx',
        '📁 Apresentação Produto.pptx',
        '📁 Orçamento.pdf'
      ].join('\n');
    } else if (cleaned.includes('ajuda')) {
      reply = `Comandos disponíveis:
- emails
- drive
- ajuda
- ping`;
    } else if (cleaned.includes('ping')) {
      reply = 'pong 🏓';
    } else {
      reply = '🤷 Desculpe, não entendi. Envie "ajuda" para ver comandos.';
    }

    return res.json({ reply });
  } catch (err) {
    console.error('❌ Erro interno:', err);
    return res.status(500).json({ reply: 'Erro interno no servidor.' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
