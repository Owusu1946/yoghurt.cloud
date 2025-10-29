import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

const ALGO = "scrypt";
const N = 16384;
const r = 8;
const p = 1;
const KEYLEN = 64;

export const hashPassword = (password: string) => {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, KEYLEN, { N, r, p });
  return `${ALGO}$${N}$${r}$${p}$${salt}$${derived.toString("hex")}`;
};

export const verifyPassword = (password: string, hash: string) => {
  try {
    const [algo, nStr, rStr, pStr, salt, hex] = hash.split("$");
    if (algo !== ALGO) return false;
    const n = Number(nStr);
    const rr = Number(rStr);
    const pp = Number(pStr);
    const derived = scryptSync(password, salt, KEYLEN, { N: n, r: rr, p: pp });
    const buf = Buffer.from(hex, "hex");
    return timingSafeEqual(derived, buf);
  } catch {
    return false;
  }
};
