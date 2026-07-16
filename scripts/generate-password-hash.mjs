import crypto from "node:crypto";

const password = process.argv[2];

if (!password) {
  console.error(
    'Uso: node scripts/generate-password-hash.mjs "Spektro54"'
  );

  process.exit(1);
}

const N = 16384;
const r = 8;
const p = 1;
const salt = crypto.randomBytes(16);

const hash = crypto.scryptSync(
  password,
  salt,
  64,
  {
    N,
    r,
    p,
    maxmem: 128 * 1024 * 1024,
  }
);

console.log(
  [
    "scrypt",
    N,
    r,
    p,
    salt.toString("base64url"),
    hash.toString("base64url"),
  ].join("$")
);