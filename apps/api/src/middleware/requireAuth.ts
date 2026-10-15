import type { RequestHandler } from 'express';
import { readAccessToken } from '../auth/readToken.js';
import { verifyAccessToken } from '../auth/tokens.js';
import { AppError } from '../errors/AppError.js';
import { User } from '../models/User.js';

export const requireAuth: RequestHandler = async (req, _res, next) => {
  try {
    const token = readAccessToken(req);
    if (!token) {
      throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
    }
    const payload = verifyAccessToken(token);
    const user = await User.findById(payload.sub).exec();
    if (!user || !user.isActive) {
      throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
    }
    req.auth = {
      userId: user._id.toString(),
      role: user.role,
      customerId: user.customerId ? user.customerId.toString() : null,
    };
    next();
  } catch (err) {
    next(err);
  }
};
