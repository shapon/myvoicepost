import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { sanitizePayload } from "./sanitize";

const TOKEN_KEY = "mvp_auth_token";

export function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAuthToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function removeAuthToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

function getAuthHeaders(): Record<string, string> {
  const token = getAuthToken();
  if (token) {
    return { Authorization: `Bearer ${token}` };
  }
  return {};
}

async function checkSessionReplaced(res: Response): Promise<boolean> {
  if (res.status === 401) {
    try {
      const cloned = res.clone();
      const data = await cloned.json();
      if (data.error === "SESSION_REPLACED") {
        removeAuthToken();
        window.dispatchEvent(new CustomEvent("session-replaced", { detail: data.message }));
        return true;
      }
    } catch {
    }
  }
  return false;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const headers: Record<string, string> = {
    ...getAuthHeaders(),
  };

  const sanitizedData = data !== undefined ? sanitizePayload(data) : data;

  if (sanitizedData) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(url, {
    method,
    headers,
    body: sanitizedData ? JSON.stringify(sanitizedData) : undefined,
    credentials: "include",
  });

  await checkSessionReplaced(res);

  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
      headers: getAuthHeaders(),
    });

    const replaced = await checkSessionReplaced(res);
    if (replaced) {
      return null as T;
    }

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
