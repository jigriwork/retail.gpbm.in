// Passwords people choose after a WhatsApp code: any letters, numbers or
// symbols, at least 6 characters, and not one of the obvious guesses.
const obvious = new Set(["123456", "1234567", "12345678", "123456789", "654321", "password", "qwerty", "abc123", "111111", "000000", "gpbm123"]);

export function passwordProblem(password: string) {
  if (password.length < 6) return "Use at least 6 characters (letters, numbers or both).";
  if (password.length > 72) return "Use at most 72 characters.";
  if (/^(.)\1+$/.test(password) || obvious.has(password.toLowerCase())) return "That password is too easy to guess. Choose another.";
  return null;
}
