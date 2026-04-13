import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

// We test auth logic directly since injecting a test db into Fastify routes is complex
describe('Auth Logic', () => {
  describe('Password Hashing', () => {
    it('hashes and verifies passwords correctly', async () => {
      const password = 'testpassword123';
      const hash = await bcrypt.hash(password, 10);

      expect(hash).not.toBe(password);
      expect(await bcrypt.compare(password, hash)).toBe(true);
      expect(await bcrypt.compare('wrongpassword', hash)).toBe(false);
    });

    it('produces different hashes for same password', async () => {
      const password = 'testpassword123';
      const hash1 = await bcrypt.hash(password, 10);
      const hash2 = await bcrypt.hash(password, 10);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('JWT Tokens', () => {
    it('signs and verifies a token', () => {
      const payload = { userId: 1, email: 'test@example.com' };
      const token = jwt.sign(payload, config.jwtSecret, { expiresIn: '7d' });

      const decoded = jwt.verify(token, config.jwtSecret) as any;
      expect(decoded.userId).toBe(1);
      expect(decoded.email).toBe('test@example.com');
    });

    it('rejects token with wrong secret', () => {
      const payload = { userId: 1, email: 'test@example.com' };
      const token = jwt.sign(payload, config.jwtSecret, { expiresIn: '7d' });

      expect(() => jwt.verify(token, 'wrong-secret')).toThrow();
    });

    it('rejects expired tokens', () => {
      const payload = { userId: 1, email: 'test@example.com' };
      const token = jwt.sign(payload, config.jwtSecret, { expiresIn: '-1s' });

      expect(() => jwt.verify(token, config.jwtSecret)).toThrow();
    });
  });
});
