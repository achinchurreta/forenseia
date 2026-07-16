import {
  createSession,
  sessionCookie,
} from "./_auth.js";

import {
  findUserByEmail,
  verifyPassword,
} from "./_users.js";

function jsonResponse(statusCode, body, headers = {}) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  };
}

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, {
      error: "Método no permitido",
    });
  }

  try {
    const { email, password } = JSON.parse(event.body || "{}");

    if (!email || !password) {
      return jsonResponse(400, {
        error: "Ingresa correo y contraseña",
      });
    }

    const user = findUserByEmail(email);

    if (!user || !verifyPassword(password, user.passwordHash)) {
      return jsonResponse(401, {
        error: "Credenciales incorrectas",
      });
    }

    const token = createSession(user);

    return jsonResponse(
      200,
      {
        success: true,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          area: user.area,
          permissions: user.permissions,
        },
      },
      {
        "Set-Cookie": sessionCookie(token),
      }
    );
  } catch (error) {
    console.error("Login error:", error);

    return jsonResponse(500, {
      error: "No fue posible iniciar sesión",
    });
  }
}