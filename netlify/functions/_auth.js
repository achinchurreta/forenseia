import crypto from "node:crypto";

const COOKIE_NAME = "forenseia_session";

function sign(value, secret) {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

export function createSession(email) {
  const secret = process.env.SESSION_SECRET;
  const payload = Buffer.from(
    JSON.stringify({
      email,
      exp: Date.now() + 1000 * 60 * 60 * 8,
    })
  ).toString("base64url");

  const signature = sign(payload, secret);

  return `${payload}.${signature}`;
}

export function verifySession(event) {
  const secret = process.env.SESSION_SECRET;
  const cookie = event.headers.cookie || "";
  const match = cookie.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));

  if (!match) return null;

  const token = match[1];
  const [payload, signature] = token.split(".");

  if (!payload || !signature) return null;

  const expected = sign(payload, secret);

  if (signature !== expected) return null;

  const data = JSON.parse(Buffer.from(payload, "base64url").toString());

  if (Date.now() > data.exp) return null;

  return data;
}

export function sessionCookie(token) {
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=28800`;
}

export function clearCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}