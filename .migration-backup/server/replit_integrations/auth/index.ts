export { setupAuth, isAuthenticated, getSession, checkRateLimit, recordFailedAttempt, clearAttempts, isPinAuthenticated, requirePermission, getSessionInfo } from "./replitAuth";
export { authStorage, type IAuthStorage } from "./storage";
export { registerAuthRoutes } from "./routes";
