import crypto from "node:crypto";

const COOKIE_NAME = "forenseia_session";
const SESSION_DURATION = 1000 * 60 * 60 * 8;

function getSecret() {
  const secret = process.env.SESSION_SECRET;

  if (!secret) {
    throw new Error("SESSION_SECRET no está configurado.");
  }

  return secret;
}

function sign(value, secret) {
  return crypto
    .createHmac("sha256", secret)
    .update(value)
    .digest("base64url");
}

function safeEqual(valueA, valueB) {
  try {
    const bufferA = Buffer.from(valueA);
    const bufferB = Buffer.from(valueB);

    if (bufferA.length !== bufferB.length) {
      return false;
    }

    return crypto.timingSafeEqual(bufferA, bufferB);
  } catch {
    return false;
  }
}

export function createSession(user) {
  const secret = getSecret();

  const sessionData = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    area: user.area,
    permissions: user.permissions,
    exp: Date.now() + SESSION_DURATION,
  };

  const payload = Buffer.from(
    JSON.stringify(sessionData),
    "utf8"
  ).toString("base64url");

  const signature = sign(payload, secret);

  return `${payload}.${signature}`;
}

export function verifySession(event) {
  try {
    const secret = getSecret();
    const cookie = event.headers.cookie || event.headers.Cookie || "";

    const match = cookie.match(
      new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`)
    );

    if (!match) {
      return null;
    }

    const token = match[1];
    const [payload, signature] = token.split(".");

    if (!payload || !signature) {
      return null;
    }

    const expectedSignature = sign(payload, secret);

    if (!safeEqual(signature, expectedSignature)) {
      return null;
    }

    const data = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    );

    if (!data.exp || Date.now() > data.exp) {
      return null;
    }

    return data;
  } catch (error) {
    console.error("Session verification error:", error);
    return null;
  }
}

export function requirePermission(event, permission) {
  const user = verifySession(event);

  if (!user) {
    return {
      authorized: false,
      statusCode: 401,
      error: "No autorizado",
      user: null,
    };
  }

  const permissions = Array.isArray(user.permissions)
    ? user.permissions
    : [];

  const authorized =
    permissions.includes("*") ||
    permissions.includes(permission);

  if (!authorized) {
    return {
      authorized: false,
      statusCode: 403,
      error: "No tienes permiso para realizar esta acción",
      user,
    };
  }

  return {
    authorized: true,
    statusCode: 200,
    error: null,
    user,
  };
}

export function sessionCookie(token) {
  return [
    `${COOKIE_NAME}=${token}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Max-Age=28800",
  ].join("; ");
}

export function clearCookie() {
  return [
    `${COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Max-Age=0",
  ].join("; ");
}