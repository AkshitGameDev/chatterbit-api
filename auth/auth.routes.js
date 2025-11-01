import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

// Helpers
const sign = (u) => jwt.sign({ sub: u.id }, JWT_SECRET, { expiresIn: '1d' });

const RegisterDto = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8),
  name: z.string().trim().min(1).optional(),
});

const LoginDto = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8),
});

// Auth middleware
function auth(req, res, next) {
  try {
    const raw = req.headers.authorization || '';
    const token = raw.startsWith('Bearer ') ? raw.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    const { sub } = jwt.verify(token, JWT_SECRET);
    req.userId = sub;
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
  }
}

// Register
router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = RegisterDto.parse(req.body);
    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) return res.status(409).json({ error: 'Email already in use' });

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { email, passwordHash, name: (name ?? null) }
    });

    return res.status(201).json({
      token: sign(user),
      user: { id: user.id, email: user.email, name: user.name },
    });
} catch (e) {
  console.error('[auth/register]', e);
  if (e instanceof z.ZodError)
    return res.status(400).json({ error: e.errors[0]?.message || 'Invalid input' });
  return res.status(500).json({ error: 'Server error', detail: e.message, code: e.code });
}
});

// Login (generic error to avoid account enumeration)
router.post('/login', async (req, res) => {
  try {
    const { email, password } = LoginDto.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Invalid email or password' });

    return res.json({
      token: sign(user),
      user: { id: user.id, email: user.email, name: user.name },
    });
} catch (e) {
  console.error('[auth/login]', e);
  if (e instanceof z.ZodError)
    return res.status(400).json({ error: e.errors[0]?.message || 'Invalid input' });
  return res.status(500).json({ error: 'Server error', detail: e.message, code: e.code });
}
});

// Current user
router.get('/me', auth, async (req, res) => {
  const me = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { id: true, email: true, name: true, createdAt: true },
  });
  return res.json({ user: me });
});

export default router;
