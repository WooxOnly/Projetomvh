const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type LoginInput = {
  email: string;
  password: string;
};

export type LoginFieldErrors = Partial<Record<keyof LoginInput, string>>;

export type LoginValidationResult =
  | {
      success: true;
      data: LoginInput;
    }
  | {
      success: false;
      errors: LoginFieldErrors;
    };

export function validateLoginInput(input: {
  email?: unknown;
  password?: unknown;
}): LoginValidationResult {
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const password = typeof input.password === "string" ? input.password : "";
  const errors: LoginFieldErrors = {};

  if (!email) {
    errors.email = "Informe o e-mail.";
  } else if (!EMAIL_REGEX.test(email)) {
    errors.email = "Informe um e-mail valido.";
  }

  if (!password) {
    errors.password = "Informe a senha.";
  }

  if (Object.keys(errors).length > 0) {
    return {
      success: false,
      errors,
    };
  }

  return {
    success: true,
    data: {
      email,
      password,
    },
  };
}
