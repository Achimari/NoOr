import bcrypt from "bcrypt";
import crypto from "node:crypto";
import { env } from "../config/env.js";
import { AppError } from "../utils/appError.js";
import {
  createAuthUser,
  createSession,
  deleteExpiredSessions,
  deleteSessionByHash,
  findActiveSessionByHash,
  findAuthUserById,
  findAuthUserByName,
} from "../repositories/authRepository.js";

const SALT_ROUNDS = 12;

export function sanitizeUser(user) {
  return {
    id: user.id,
    name: user.name,
    isTelegramLinked: user.isTelegramLinked,
    createdAt: user.createdAt,
  };
}

export function hashSessionToken(sessionToken) {
  return crypto.createHash("sha256").update(sessionToken).digest("hex");
}

function createPlainSessionToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function getSessionMaxAgeMs() {
  return env.SESSION_DAYS * 24 * 60 * 60 * 1000;
}

async function createUserSession(userId) {
  await deleteExpiredSessions();

  const sessionToken = createPlainSessionToken();
  const sessionTokenHash = hashSessionToken(sessionToken);
  const expiresAt = new Date(Date.now() + getSessionMaxAgeMs());

  await createSession({
    userId,
    sessionTokenHash,
    expiresAt,
  });

  return {
    sessionToken,
    expiresAt,
  };
}

export async function registerUser({ name, password }) {
  const existingUser = await findAuthUserByName(name);
  if (existingUser) {
    throw new AppError("User already exists", 409);
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const user = await createAuthUser({ name, passwordHash });
  const session = await createUserSession(user.id);

  return {
    user: sanitizeUser(user),
    ...session,
  };
}

export async function loginUser({ name, password }) {
  const user = await findAuthUserByName(name);
  if (!user) {
    throw new AppError("Invalid name or password", 401);
  }

  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
  if (!isPasswordValid) {
    throw new AppError("Invalid name or password", 401);
  }

  const session = await createUserSession(user.id);

  return {
    user: sanitizeUser(user),
    ...session,
  };
}

export async function getUserById(id) {
  const user = await findAuthUserById(Number(id));
  if (!user) {
    throw new AppError("User not found", 404);
  }

  return sanitizeUser(user);
}

export async function getSessionByToken(sessionToken) {
  if (!sessionToken) {
    return null;
  }

  const session = await findActiveSessionByHash(hashSessionToken(sessionToken));
  if (!session) {
    return null;
  }

  return {
    id: session.id,
    expiresAt: session.expiresAt,
    user: sanitizeUser(session.user),
  };
}

export async function logoutSession(sessionToken) {
  if (!sessionToken) {
    return;
  }

  await deleteSessionByHash(hashSessionToken(sessionToken));
}
