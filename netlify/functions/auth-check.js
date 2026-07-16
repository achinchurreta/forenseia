import { verifySession } from "./_auth.js";

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(body),
  };
}

export async function handler(event) {
  const user = verifySession(event);

  if (!user) {
    return jsonResponse(401, {
      authenticated: false,
    });
  }

  return jsonResponse(200, {
    authenticated: true,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      area: user.area,
      permissions: user.permissions,
    },
  });
}