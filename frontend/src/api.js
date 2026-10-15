/** Keep development requests same-origin so session cookies work in Windows/WSL. */
export function createApi({ base = '', fetcher = globalThis.fetch, onUnauthorized } = {}) {
  const prefix = String(base).replace(/\/$/, '');
  return async function api(path, options = {}) {
    if (typeof path !== 'string' || !path.startsWith('/api/v1/') || path.includes('://')) {
      throw new Error('API requests must use a local /api/v1/ path.');
    }
    const { body, responseType = 'json', headers = {}, ...fetchOptions } = options;
    const rawBody = body != null && (
      typeof Blob !== 'undefined' && body instanceof Blob
      || typeof ArrayBuffer !== 'undefined' && body instanceof ArrayBuffer
      || typeof FormData !== 'undefined' && body instanceof FormData
    );
    const requestHeaders = new Headers(headers);
    let requestBody = body;
    if (body != null && !rawBody) {
      if (!requestHeaders.has('content-type')) requestHeaders.set('content-type', 'application/json');
      requestBody = JSON.stringify(body);
    }
    const response = await fetcher(`${prefix}${path}`, {
      ...fetchOptions, credentials: 'include', cache: 'no-store', headers: requestHeaders, body: requestBody,
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      const detail = payload?.detail;
      const message = Array.isArray(detail) ? detail.map((item) => item.msg).join(', ')
        : typeof detail === 'string' ? detail : `Request failed (${response.status})`;
      const error = Object.assign(new Error(message), { status: response.status, detail });
      if (response.status === 401 && !path.startsWith('/api/v1/auth/')) onUnauthorized?.();
      throw error;
    }
    if (response.status === 204) return null;
    return responseType === 'blob' ? response.blob() : response.json();
  };
}
