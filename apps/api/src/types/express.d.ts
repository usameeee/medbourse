import type { UserRole } from '@medbourse/shared';

declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        role: UserRole;
        customerId: string | null;
      };
    }
  }
}

export {};
