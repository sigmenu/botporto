declare namespace Express {
  interface Request {
    user?: {
      id?: string; // alias for compatibility
      userId: string;
      email: string;
      role?: string;
    }
  }
}