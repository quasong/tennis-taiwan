import type { StoredUser } from "./types";

export const STORAGE_KEY = "tennis-taiwan-user";

export function parseStoredUser(snapshot: string): StoredUser | null {
  try {
    return snapshot ? (JSON.parse(snapshot) as StoredUser) : null;
  } catch {
    return null;
  }
}

export function getAuthSnapshot() {
  if (typeof window === "undefined") {
    return "";
  }

  return window.localStorage.getItem(STORAGE_KEY) ?? "";
}

export function subscribeToAuthStore(onStoreChange: () => void) {
  if (typeof window === "undefined") {
    return () => {};
  }

  window.addEventListener("storage", onStoreChange);
  window.addEventListener("tennis-auth-change", onStoreChange);

  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener("tennis-auth-change", onStoreChange);
  };
}

export function emitAuthChange() {
  window.dispatchEvent(new Event("tennis-auth-change"));
}

export function clearStoredUser() {
  if (typeof window === "undefined") return;

  window.localStorage.removeItem(STORAGE_KEY);
  emitAuthChange();
}

export function handleUnauthorizedResponse(response: Response) {
  if (response.status !== 401) return false;

  clearStoredUser();
  return true;
}

export async function validateAuthSession() {
  try {
    const response = await fetch("/api/user/login", {
      cache: "no-store",
      credentials: "same-origin",
    });

    if (response.status === 401) {
      clearStoredUser();
      return false;
    }

    return response.ok;
  } catch {
    return false;
  }
}
