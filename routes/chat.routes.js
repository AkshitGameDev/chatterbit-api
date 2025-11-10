import express from 'express';
import { prisma } from '../lib/prisma.js';
import { auth } from '../middleware/auth.js';
import OpenAI from 'openai';

const router = express.Router();

// force JSON parsing for EVERYTHING in /chat
router.use(express.json());

// make client only if key exists (so local dev doesn’t crash)
const hasAI = !!process.env.OPENAI_API_KEY;
const openai = hasAI ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

/**
 * GET /chat/conversations
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
 */
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
  } catch (e) {
    next(e);
  }
});

/**
 * POST /chat/conversations/:id/messages
 */
router.post('/conversations/:id/messages', auth, async (req, res, next) => {
  try {
    const convoId = req.params.id;

    // what did the client send?
    const { content } = req.body || {};
    if (!content) {
      console.log('[chat] body was:', req.body);
      return res.status(400).json({ error: 'content required' });
    }

    // check ownership
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

    // 2) gather history for context
    const history = await prisma.message.findMany({
      where: { conversationId: convoId },
      orderBy: { createdAt: 'asc' },
      take: 12,
    });

    // 3) no key → fallback right away
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

    // default reply in case OpenAI fails (quota, network, etc.)
    let replyText =
      '🤖 I could not reach the AI right now. Please try again later or check billing.';

    // 4) try real OpenAI call
    try {
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

      replyText =
        completion.choices?.[0]?.message?.content ||
        'Sorry, I could not generate a response.';
    } catch (aiErr) {
      console.error('[chat] openai error', aiErr?.message || aiErr);
      // keep fallback replyText
    }

    // 5) store assistant message no matter what
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
