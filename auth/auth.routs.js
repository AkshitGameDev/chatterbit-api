import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

// validators
const RegisterDto = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).optional()
});
const LoginDto = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

// sign token
const sign = (u) => jwt.sign({ sub: u.id }, JWT_SECRET, { expiresIn: '1d' });

// register
router.post('/register', async (req, res, next) => {
  try {
    const { email, password, name } = RegisterDto.parse(req.body);
    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) return res.status(409).json({ error: 'Email already in use' });

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({ data: { email, passwordHash, name } });
    res.status(201).json({ token: sign(user), user: { id: user.id, email: user.email, name: user.name } });
  } catch (e) { next(e); }
});

// login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = LoginDto.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    res.json({ token: sign(user), user: { id: user.id, email: user.email, name: user.name } });
  } catch (e) { next(e); }
});

export default router;
