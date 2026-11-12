const RESET_IDENTIFIER_KEY = "sdas:reset-identifier";

export function rememberResetIdentifier(identifier: string): void {
  try {
    window.sessionStorage.setItem(RESET_IDENTIFIER_KEY, identifier);
  } catch {
    // session storage may be unavailable in restricted browser modes
  }
}

export function readResetIdentifier(): string {
  try {
    return window.sessionStorage.getItem(RESET_IDENTIFIER_KEY) ?? "";
  } catch {
    return "";
  }
}

export function forgetResetIdentifier(): void {
  try {
    window.sessionStorage.removeItem(RESET_IDENTIFIER_KEY);
  } catch {
    // ignore
  }
}
