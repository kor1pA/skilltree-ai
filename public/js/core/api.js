import { state } from './state.js';
import { setButtonLoading, showToast } from './dom.js';

export async function api(url, options = {}) {
  const config = {
    credentials: 'same-origin',
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'SkillTreeUI',
      ...(options.headers || {}),
    },
  };

  const response = await fetch(url, config);
  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json')
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const errMsg =
      typeof payload === 'object' && payload !== null && payload.error
        ? payload.error
        : `Помилка HTTP ${response.status}`;
    throw new Error(errMsg);
  }

  return payload;
}

export async function mutateAndSync(
  url,
  options = {},
  { button = null, onSuccess = null, successMessage = '', renderView = null } = {}
) {
  setButtonLoading(button, true);
  try {
    const res = await api(url, options);
    if (res && typeof res === 'object' && res.state) {
      state.data = res.state;
    }
    if (typeof onSuccess === 'function') {
      onSuccess(res);
    }
    if (typeof renderView === 'function') {
      renderView();
    }
    if (successMessage) {
      showToast(typeof successMessage === 'function' ? successMessage(res) : successMessage);
    }
    return res;
  } catch (err) {
    showToast(err.message, true);
    return null;
  } finally {
    setButtonLoading(button, false);
  }
}
