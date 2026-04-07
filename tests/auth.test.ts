import test from "node:test";
import assert from "node:assert/strict";

import { hashPassword, verifyPassword } from "../lib/auth/password.ts";
import { validateLoginInput } from "../lib/auth/validation.ts";

test("validateLoginInput returns errors for invalid credentials", () => {
  const result = validateLoginInput({
    email: "invalido",
    password: "123",
  });

  assert.equal(result.success, false);

  if (result.success) {
    throw new Error("Expected validation to fail.");
  }

  assert.equal(result.errors.email, "Informe um e-mail valido.");
  assert.equal(result.errors.password, "A senha deve ter pelo menos 8 caracteres.");
});

test("validateLoginInput normalizes valid credentials", () => {
  const result = validateLoginInput({
    email: "  USER@Example.COM ",
    password: "Admin123!",
  });

  assert.equal(result.success, true);

  if (!result.success) {
    throw new Error("Expected validation to succeed.");
  }

  assert.equal(result.data.email, "user@example.com");
  assert.equal(result.data.password, "Admin123!");
});

test("password hashing and verification work together", () => {
  const password = "Admin123!";
  const hash = hashPassword(password);

  assert.match(hash, /^scrypt:/);
  assert.equal(verifyPassword(password, hash), true);
  assert.equal(verifyPassword("Wrong123!", hash), false);
});
