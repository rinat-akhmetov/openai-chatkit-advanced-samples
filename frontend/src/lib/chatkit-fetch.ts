import type { PageContext } from "../types/page-context";

/**
 * Creates a custom fetch function that injects the X-Page-Context header
 * into all ChatKit API requests.
 *
 * The backend requires channelCode and instance fields for multi-tenant
 * thread isolation.
 *
 * @param pageContext - The page context to send with requests
 * @returns Custom fetch function for ChatKit
 */
export function createChatkitFetch(pageContext: PageContext) {
  return async (url: string | Request, options?: RequestInit): Promise<Response> => {
    const headers = new Headers(options?.headers);

    // Add page context as header so the backend can extract it
    headers.set('X-Page-Context', JSON.stringify(pageContext));

    // Add authorization header for debug access
    headers.set('Authorization', 'Bearer debug-token');

    // Execute the request with the modified headers
    return fetch(url, {
      ...options,
      headers,
    });
  };
}
