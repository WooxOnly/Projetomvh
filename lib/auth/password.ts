import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SCRYPT_KEY_LENGTH = 64;

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = scryptSync(password, salt, SCRYPT_KEY_LENGTH).toString("hex");

  return `scrypt:${salt}:${derivedKey}`;
}

export function verifyPassword(password: string, storedHash: string) {
  const [algorithm, salt, hashedValue] = storedHash.split(":");

  if (algorithm !== "scrypt" || !salt || !hashedValue) {
    return false;
  }

  const suppliedBuffer = scryptSync(password, salt, SCRYPT_KEY_LENGTH);
  const storedBuffer = Buffer.from(hashedValue, "hex");

  if (suppliedBuffer.length !== storedBuffer.length) {
    return false;
  }

  return timingSafeEqual(suppliedBuffer, storedBuffer);
}

export function matchesStoredPassword(password: string, storedValue: string) {
  if (storedValue.startsWith("scrypt:")) {
    return verifyPassword(password, storedValue);
  }

  return password === storedValue;
}
