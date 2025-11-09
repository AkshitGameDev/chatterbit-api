
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

export function auth(req, res, next) {
  try {
    const raw = req.headers.authorization || '';
    const token = raw.startsWith('Bearer ') ? raw.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Missing token' });

    const { sub } = jwt.verify(token, JWT_SECRET);
    req.userId = sub;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
}
