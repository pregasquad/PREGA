import * as client from "openid-client";
import { Strategy, type VerifyFunction } from "openid-client/passport";

import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import memoize from "memoizee";
import MemoryStore from "memorystore";
import { authStorage } from "./storage";

// Extend session data type for PIN-based auth
declare module 'express-session' {
  interface SessionData {
    pinAuth?: {
      userName: string;
      role: string;
      permissions: string[];
      authenticatedAt: number;
    };
    user_authenticated?: boolean;
  }
}

// Rate limiting for PIN attempts
const pinAttempts = new Map<string, { count: number; lastAttempt: number }>();
const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION = 5 * 60 * 1000; // 5 minutes

export function checkRateLimit(identifier: string): { allowed: boolean; remainingAttempts: number; lockoutUntil?: number } {
  const now = Date.now();
  const record = pinAttempts.get(identifier);
  
  if (!record) {
    return { allowed: true, remainingAttempts: MAX_ATTEMPTS };
  }
  
  // Reset if lockout period has passed
  if (now - record.lastAttempt > LOCKOUT_DURATION) {
    pinAttempts.delete(identifier);
    return { allowed: true, remainingAttempts: MAX_ATTEMPTS };
  }
  
  if (record.count >= MAX_ATTEMPTS) {
    return { 
      allowed: false, 
      remainingAttempts: 0, 
      lockoutUntil: record.lastAttempt + LOCKOUT_DURATION 
    };
  }
  
  return { allowed: true, remainingAttempts: MAX_ATTEMPTS - record.count };
}

export function recordFailedAttempt(identifier: string): void {
  const now = Date.now();
  const record = pinAttempts.get(identifier);
  
  if (!record || now - record.lastAttempt > LOCKOUT_DURATION) {
    pinAttempts.set(identifier, { count: 1, lastAttempt: now });
  } else {
    record.count++;
    record.lastAttempt = now;
  }
}

export function clearAttempts(identifier: string): void {
  pinAttempts.delete(identifier);
}

const getOidcConfig = memoize(
  async () => {
    return await client.discovery(
      new URL(process.env.ISSUER_URL ?? "https://replit.com/oidc"),
      process.env.REPL_ID!
    );
  },
  { maxAge: 3600 * 1000 }
);

// Session secret handling - require in production, warn in development
let cachedSecret: string = "";
function getSessionSecret(): string {
  if (cachedSecret) return cachedSecret;
  
  if (process.env.SESSION_SECRET) {
    cachedSecret = process.env.SESSION_SECRET;
    return cachedSecret;
  }
  
  // Generate a random secret
  const crypto = require('crypto');
  cachedSecret = crypto.randomBytes(32).toString('hex');
  
  // In production, log error prominently
  if (process.env.NODE_ENV === 'production') {
    console.error("CRITICAL: SESSION_SECRET environment variable is not set. This is required for production deployments.");
  } else {
    console.warn("WARNING: No SESSION_SECRET set. Using a random session secret for this session. Set SESSION_SECRET for persistent sessions.");
  }
  
  return cachedSecret;
}

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const MemoryStoreSession = MemoryStore(session);
  const sessionStore = new MemoryStoreSession({
    checkPeriod: 86400000, // prune expired entries every 24h
  });
  return session({
    secret: getSessionSecret(),
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: sessionTtl,
      sameSite: 'strict', // Prevent CSRF attacks
    },
  });
}

function updateUserSession(
  user: any,
  tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers
) {
  user.claims = tokens.claims();
  user.access_token = tokens.access_token;
  user.refresh_token = tokens.refresh_token;
  user.expires_at = user.claims?.exp;
}

async function upsertUser(claims: any) {
  await authStorage.upsertUser({
    id: claims["sub"],
    email: claims["email"],
    firstName: claims["first_name"],
    lastName: claims["last_name"],
    profileImageUrl: claims["profile_image_url"],
  });
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  // Health check endpoint for Koyeb
  app.get("/health", (_req, res) => {
    res.status(200).send("OK");
  });

  // Skip Replit auth setup if not on Replit
  if (!process.env.REPL_ID) {
    console.log("Not on Replit - auth routes disabled");
    
    passport.serializeUser((user: Express.User, cb) => cb(null, user));
    passport.deserializeUser((user: Express.User, cb) => cb(null, user));
    
    app.get("/api/login", (_req, res) => {
      res.json({ message: "Auth not available outside Replit" });
    });
    
    app.get("/api/logout", (_req, res) => {
      res.redirect("/");
    });
    
    return;
  }

  const config = await getOidcConfig();

  const verify: VerifyFunction = async (
    tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers,
    verified: passport.AuthenticateCallback
  ) => {
    const user = {};
    updateUserSession(user, tokens);
    await upsertUser(tokens.claims());
    verified(null, user);
  };

  // Keep track of registered strategies
  const registeredStrategies = new Set<string>();

  // Helper function to ensure strategy exists for a domain
  const ensureStrategy = (domain: string) => {
    const strategyName = `replitauth:${domain}`;
    if (!registeredStrategies.has(strategyName)) {
      const strategy = new Strategy(
        {
          name: strategyName,
          config,
          scope: "openid email profile offline_access",
          callbackURL: `https://${domain}/api/callback`,
        },
        verify
      );
      passport.use(strategy);
      registeredStrategies.add(strategyName);
    }
  };

  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));

  app.get("/api/login", (req, res, next) => {
    ensureStrategy(req.hostname);
    passport.authenticate(`replitauth:${req.hostname}`, {
      prompt: "login consent",
      scope: ["openid", "email", "profile", "offline_access"],
    })(req, res, next);
  });

  app.get("/api/callback", (req, res, next) => {
    ensureStrategy(req.hostname);
    passport.authenticate(`replitauth:${req.hostname}`, {
      successReturnToOrRedirect: "/",
      failureRedirect: "/api/login",
    })(req, res, next);
  });

  app.get("/api/logout", (req, res) => {
    req.logout(() => {
      res.redirect(
        client.buildEndSessionUrl(config, {
          client_id: process.env.REPL_ID!,
          post_logout_redirect_uri: `${req.protocol}://${req.hostname}`,
        }).href
      );
    });
  });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  // Skip auth check if not on Replit
  if (!process.env.REPL_ID) {
    return next();
  }

  const user = req.user as any;

  if (!req.isAuthenticated() || !user.expires_at) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const now = Math.floor(Date.now() / 1000);
  if (now <= user.expires_at) {
    return next();
  }

  const refreshToken = user.refresh_token;
  if (!refreshToken) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  try {
    const config = await getOidcConfig();
    const tokenResponse = await client.refreshTokenGrant(config, refreshToken);
    updateUserSession(user, tokenResponse);
    return next();
  } catch (error) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
};

// PIN-based authentication middleware
export const isPinAuthenticated: RequestHandler = (req, res, next) => {
  if (req.session?.pinAuth?.userName || req.session?.user_authenticated === true) {
    return next();
  }
  return res.status(401).json({ message: "Unauthorized - Please login with your PIN" });
};

// Permission check middleware - creates a middleware that checks for specific permission
export function requirePermission(permission: string): RequestHandler {
  return (req, res, next) => {
    const pinAuth = req.session?.pinAuth;
    if (!pinAuth) {
      return res.status(401).json({ message: "Unauthorized - Please login first" });
    }
    
    // Empty permissions array means full access (opt-in restriction model)
    if (!pinAuth.permissions || pinAuth.permissions.length === 0) {
      return next();
    }
    
    if (pinAuth.permissions.includes(permission)) {
      return next();
    }
    
    return res.status(403).json({ message: "Forbidden - You do not have permission to access this resource" });
  };
}

// Get current session info
export function getSessionInfo(req: any): { userName: string; role: string; permissions: string[] } | null {
  return req.session?.pinAuth || null;
}
