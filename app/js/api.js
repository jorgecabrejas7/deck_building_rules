// One way to talk to the server's /pod/api: session cookie, CSRF header, language. status 0 = the server could not be reached.
import { state } from './state.js';

export const csrf = () => (document.cookie.match(/(?:^|; )pod_csrftoken=([^;]*)/) || [])[1] || '';

export async function api(url, method = 'GET', body) {
  try {
    const r = await fetch(url, {
      method, credentials: 'same-origin',
      headers: { 'X-CSRFToken': csrf(), 'Accept-Language': state.lang, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, data: await r.json().catch(() => ({})) };
  } catch (e) { return { status: 0, data: {} }; }
}
