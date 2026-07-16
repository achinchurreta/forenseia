import crypto from "node:crypto";

const SCRYPT_PREFIX = "scrypt";
const KEY_LENGTH = 64;

const PERMISSIONS = {
  admin: ["*"],

  "director-ia": [
    "posts",
    "courses",
    "services",
    "resources",
    "cases",
    "social",
    "resources",
  ],

  "director-psychology": [
    "posts",
    "courses",
    "services",
    "resources",
    "cases",
    "social",
    "resources",
  ],
};

function decodeBase64Url(value = "") {
  const normalized = value
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");

  return Buffer.from(normalized, "base64");
}

export function verifyPassword(password, storedHash) {
  try {
    if (!password || !storedHash) {
      return false;
    }

    const [
      prefix,
      nValue,
      rValue,
      pValue,
      saltValue,
      expectedValue,
    ] = storedHash.split("$");

    if (
      prefix !== SCRYPT_PREFIX ||
      !nValue ||
      !rValue ||
      !pValue ||
      !saltValue ||
      !expectedValue
    ) {
      return false;
    }

    const salt = decodeBase64Url(saltValue);
    const expectedHash = decodeBase64Url(expectedValue);

    const derivedHash = crypto.scryptSync(
      String(password),
      salt,
      KEY_LENGTH,
      {
        N: Number(nValue),
        r: Number(rValue),
        p: Number(pValue),
        maxmem: 128 * 1024 * 1024,
      }
    );

    if (derivedHash.length !== expectedHash.length) {
      return false;
    }

    return crypto.timingSafeEqual(derivedHash, expectedHash);
  } catch (error) {
    console.error("Password verification error:", error);
    return false;
  }
}

export function getUsers() {
  return [
    {
      id: "augusto-chinchurreta",
      name: "Augusto Chinchurreta",
      email: String(process.env.ADMIN_EMAIL || "")
        .trim()
        .toLowerCase(),
      passwordHash: process.env.ADMIN_PASSWORD_HASH || "",
      role: "admin",
      area: "Administración general",
      permissions: PERMISSIONS.admin,
    },

    {
      id: "gonzalo-garcia",
      name: "Gonzalo García",
      email: "gonzalocmh@gmail.com",
      passwordHash: process.env.GONZALO_PASSWORD_HASH || "",
      role: "director-ia",
      area: "Inteligencia Artificial Aplicada",
      permissions: PERMISSIONS["director-ia"],
    },

    {
      id: "tania-perez",
      name: "Tania Pérez",
      email: "taniapesa.21@gmail.com",
      passwordHash: process.env.TANIA_PASSWORD_HASH || "",
      role: "director-psychology",
      area: "Psicología Criminal",
      permissions: PERMISSIONS["director-psychology"],
    },
  ].filter((user) => user.email && user.passwordHash);
}

export function findUserByEmail(email = "") {
  const normalizedEmail = String(email).trim().toLowerCase();

  return (
    getUsers().find(
      (user) => user.email.toLowerCase() === normalizedEmail
    ) || null
  );
}

export function can(user, permission) {
  if (!user || !Array.isArray(user.permissions)) {
    return false;
  }

  return (
    user.permissions.includes("*") ||
    user.permissions.includes(permission)
  );
}