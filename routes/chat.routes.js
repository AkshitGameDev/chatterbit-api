import express from 'express';
import { prisma } from '../lib/prisma.js';
import { auth } from '../middleware/auth.js';
import OpenAI from 'openai';

const router = express.Router();

// make client only if key exists (so local dev doesn’t crash)
const hasAI = !!process.env.OPENAI_API_KEY;
const openai = hasAI ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

/**
 * GET /chat/conversations
 * list current user's conversations
 */
router.get('/conversations', auth, async (req, res, next) => {
  try {
    const convos = await prisma.conversation.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, title: true, createdAt: true },
    });
    res.json({ conversations: convos });
  } catch (e) {
    next(e);
  }
});

/**
 * POST /chat/conversations
 * create a new conversation
 */
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
  } catch (e) {
    next(e);
  }
});

/**
 * GET /chat/conversations/:id/messages
 * get all messages for a conversation
 */
router.get('/conversations/:id/messages', auth, async (req, res, next) => {
  try {
    const convoId = req.params.id;

    // ensure convo belongs to user
    const convo = await prisma.conversation.findFirst({
      where: { id: convoId, userId: req.userId },
    });
    if (!convo) return res.status(404).json({ error: 'Not found' });

    const messages = await prisma.message.findMany({
      where: { conversationId: convoId },
      orderBy: { createdAt: 'asc' },
    });

    res.json({ messages });
  } catch (e) {
    next(e);
  }
});

/**
 * POST /chat/conversations/:id/messages
 * user sends a message, we save it, call OpenAI, save reply, return reply
 */
router.post('/conversations/:id/messages', auth, async (req, res, next) => {
  try {
    const convoId = req.params.id;
    const { content } = req.body || {};

    if (!content) {
      return res.status(400).json({ error: 'content required' });
    }

    // ensure convo belongs to user
    const convo = await prisma.conversation.findFirst({
      where: { id: convoId, userId: req.userId },
    });
    if (!convo) return res.status(404).json({ error: 'Not found' });

    // 1) store user's message
    await prisma.message.create({
      data: {
        conversationId: convoId,
        role: 'user',
        content,
      },
    });

    // 2) build chat history for context
    const history = await prisma.message.findMany({
      where: { conversationId: convoId },
      orderBy: { createdAt: 'asc' },
      take: 12, // keep it small for now
    });

    // 3) if no OpenAI key, return dummy reply
    if (!hasAI || !openai) {
      const assistantMsg = await prisma.message.create({
        data: {
          conversationId: convoId,
          role: 'assistant',
          content:
            '🤖 AI not configured on this server yet. Add OPENAI_API_KEY to enable real replies.',
        },
      });
      return res.status(201).json({ message: assistantMsg });
    }

    // 4) call OpenAI
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are the Chatterbit assistant.' },
        ...history.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      ],
    });

    const replyText =
      completion.choices?.[0]?.message?.content ||
      'Sorry, I could not generate a response.';

    // 5) store assistant message
    const assistantMsg = await prisma.message.create({
      data: {
        conversationId: convoId,
        role: 'assistant',
        content: replyText,
      },
    });

    res.status(201).json({ message: assistantMsg });
  } catch (e) {
    console.error('[chat] error', e);
    next(e);
  }
});

export default router;
