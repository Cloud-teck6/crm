import axios, { AxiosError, AxiosRequestConfig } from 'axios';

// Same-origin by default: the API is served at /api on whatever origin the app
// is loaded from (the API server serves the SPA in prod; Vite proxies /api in
// dev). Set VITE_API_BASE_URL only when the API lives on a different origin.
const baseURL = `${import.meta.env.VITE_API_BASE_URL ?? ''}/api`;

// Cookies (httpOnly access/refresh) ride along with every request.
export const api = axios.create({
  baseURL,
  withCredentials: true,
});

// Single-flight refresh: on a 401, try POST /auth/refresh once, then replay.
let refreshing: Promise<void> | null = null;

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as AxiosRequestConfig & { _retried?: boolean };
    const url = original?.url ?? '';
    const isAuthRoute = url.includes('/auth/login') || url.includes('/auth/refresh') || url.includes('/auth/register');

    if (error.response?.status === 401 && !original._retried && !isAuthRoute) {
      original._retried = true;
      try {
        if (!refreshing) {
          refreshing = api.post('/auth/refresh').then(() => undefined).finally(() => {
            refreshing = null;
          });
        }
        await refreshing;
        return api(original);
      } catch {
        // fall through to reject
      }
    }
    return Promise.reject(error);
  },
);

// Download a report CSV (cookie-authenticated) and trigger a file save.
export async function downloadCsv(metric: string, params: Record<string, string> = {}) {
  const res = await api.get('/reports/export', { params: { metric, ...params }, responseType: 'blob' });
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${metric}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function apiErrorMessage(err: unknown): string {
  const ax = err as AxiosError<{ message?: string | string[] }>;
  const msg = ax?.response?.data?.message;
  if (Array.isArray(msg)) return msg.join(', ');
  return msg || ax?.message || 'Something went wrong';
}
