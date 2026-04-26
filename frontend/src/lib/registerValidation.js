/** Client-side checks aligned with cf-worker /api/auth/register (422-style messages). */

export function normalizeRegisterPayload({ email, username, password }) {
  return {
    email: String(email || "").trim().toLowerCase(),
    username: String(username || "").trim(),
    password: String(password || ""),
  };
}

/**
 * @returns {string[]} empty if valid; otherwise human-readable errors (Polish).
 */
export function validateRegisterFields({ email, username, password, passwordConfirm }) {
  const e = [];
  const em = String(email || "").trim().toLowerCase();
  const un = String(username || "").trim();
  const pw = String(password || "");
  const pc = passwordConfirm !== undefined ? String(passwordConfirm || "") : pw;

  if (un.length < 2) e.push("Sigil musi mieć co najmniej 2 znaki.");
  if (un.length > 32) e.push("Sigil może mieć co najwyżej 32 znaki.");
  if (!em || !em.includes("@")) {
    e.push("Podaj prawidłowy adres e-mail.");
  }
  if (pw.length < 6) e.push("Hasło musi mieć co najmniej 6 znaków.");
  if (pw.length > 100) e.push("Hasło może mieć co najwyżej 100 znaków.");
  if (pw !== pc) e.push("Hasła nie są takie same.");
  return e;
}
