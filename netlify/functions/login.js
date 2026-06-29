import { createSession, sessionCookie } from "./_auth.js";

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Método no permitido" };
  }

  const { email, password } = JSON.parse(event.body || "{}");

  if (
    email !== process.env.ADMIN_EMAIL ||
    password !== process.env.ADMIN_PASSWORD
  ) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: "Credenciales incorrectas" }),
    };
  }

  const token = createSession(email);

  return {
    statusCode: 200,
    headers: {
      "Set-Cookie": sessionCookie(token),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ success: true }),
  };
}