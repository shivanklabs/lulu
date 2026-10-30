// Client-side checks mirror backend/src/modules/auth/auth.schemas.ts. The server validates again.

export const validateEmail = (email: string): string | undefined => {
  const v = email.trim();
  if (!v) return 'Email is required';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return 'Enter a valid email address';
  return undefined;
};

export const validatePassword = (password: string): string | undefined => {
  if (password.length < 10) return 'Password must be at least 10 characters';
  if (password.length > 128) return 'Password is too long';
  if (!/[A-Za-z]/.test(password)) return 'Password must contain a letter';
  if (!/\d/.test(password)) return 'Password must contain a number';
  return undefined;
};

export const validateName = (name: string): string | undefined => {
  const v = name.trim();
  if (v.length < 2) return 'Name is too short';
  if (v.length > 120) return 'Name is too long';
  return undefined;
};

export const validatePhone = (phone: string): string | undefined => {
  if (!/^\+?[0-9][0-9 -]{8,16}[0-9]$/.test(phone.trim())) return 'Enter a valid phone number, e.g. +91 98765 43210';
  return undefined;
};

export const PASSWORD_HINT = 'At least 10 characters, including a letter and a number.';

export const compact = (errors: Record<string, string | undefined>): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(errors)) if (v) out[k] = v;
  return out;
};
