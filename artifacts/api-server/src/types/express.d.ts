import 'express';

declare global {
  namespace Express {
    interface Request {
      params: Record<string, string>;
    }
  }
}
