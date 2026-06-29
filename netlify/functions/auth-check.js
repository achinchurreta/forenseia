import { verifySession } from "./_auth.js";

export async function handler(event) {
  const user = verifySession(event);

  if (!user) {
    return {
      statusCode: 401,
      body: JSON.stringify({ authenticated: false }),
    };
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ authenticated: true, email: user.email }),
  };
}