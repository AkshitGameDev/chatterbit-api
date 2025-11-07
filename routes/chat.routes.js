import express from 'express';
import { prisma } from '../lib/prisma.js';
import { auth } from '../middleware/auth.js'; // you already have similar in user.routes
import OpenAI from 'openai';

const router = express.Router();
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

router.get('/conversations', auth, async (req, res, next) => {
  try {
    const convos = await prisma.conversation.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, title: true, createdAt: true },
    });
    res.json({ conversations: convos });
  } catch (e) { next(e); }
});

router.post('/conversations', auth, async (req, res, next) => {
  try {
    const { title } = req.body || {};
    const convo = await prisma.conversation.create({
      data: {
        userId: req.userId,
        title: title || 'New chat',
      },
      select: { id: true, title: true, createdAt: true },
    });
    res.status(201).json({ conversation: convo });
  } catch (e) { next(e); }
});

router.get('/conversations/:id/messages', auth, async (req, res, next) => {
  try {
    const convoId = req.params.id;
    const convo = await prisma.conversation.findFirst({
      where: { id: convoId, userId: req.userId },
    });
    if (!convo) return res.status(404).json({ error: 'Not found' });

    const messages = await prisma.message.findMany({
      where: { conversationId: convoId },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ messages });
  } catch (e) { next(e); }
});

router.post('/conversations/:id/messages', auth, async (req, res, next) => {
  try {
    const convoId = req.params.id;
    const { content } = req.body || {};
    if (!content) return res.status(400).json({ error: 'content required' });

    // check ownership
    const convo = await prisma.conversation.findFirst({
      where: { id: convoId, userId: req.userId },
    });
    if (!convo) return res.status(404).json({ error: 'Not found' });

    // save user message
    const userMsg = await prisma.message.create({
      data: {
        conversationId: convoId,
        role: 'user',
        content,
      },
    });

    // fetch last messages to give context to the model (simple, can improve later)
    const history = await prisma.message.findMany({
      where: { conversationId: convoId },
      orderBy: { createdAt: 'asc' },
      take: 12,
    });

    // call OpenAI
    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a helpful chatbot for Chatterbit.' },
        ...history.map(m => ({ role: m.role, content: m.content })),
      ],
    });

    const replyText = completion.choices[0]?.message?.content ?? '...';

    // save assistant message
    const assistantMsg = await prisma.message.create({
      data: {
        conversationId: convoId,
        role: 'assistant',
        content: replyText,
      },
    });

    res.status(201).json({ message: assistantMsg });
  } catch (e) {
    console.error('[chat]', e);
    next(e);
  }
});

export default router;