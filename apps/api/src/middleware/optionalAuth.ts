import type { RequestHandler } from 'express';
import { readAccessToken } from '../auth/readToken.js';
import { verifyAccessToken } from '../auth/tokens.js';
import { User } from '../models/User.js';

export const optionalAuth: RequestHandler = async (req, _res, next) => {
  try {
    const token = readAccessToken(req);
    if (!token) {
      next();
      return;
    }
    const payload = verifyAccessToken(token);
    const user = await User.findById(payload.sub).exec();
    if (user?.isActive) {
      req.auth = {
        userId: user._id.toString(),
        role: user.role,
        customerId: user.customerId ? user.customerId.toString() : null,
      };
    }
    next();
  } catch {
    next();
  }
};
