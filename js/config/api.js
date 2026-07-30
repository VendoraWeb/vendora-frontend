// API Configuration
export const BASE_URL = 'https://vendora-backend-zeta.vercel.app/api';

// Helper to get active session user
export function getActiveSession() {
  try {
    const sessionStr = sessionStorage.getItem('vendora_session');
    if (!sessionStr) return null;
    return JSON.parse(sessionStr);
  } catch (e) {
    return null;
  }
}

// Helper to set active session
export function setActiveSession(sessionData) {
  try {
    sessionStorage.setItem('vendora_session', JSON.stringify(sessionData));
  } catch (e) {
    console.warn('Storage blocked', e);
  }
}

// Helper to clear session
export function clearActiveSession() {
  try {
    sessionStorage.removeItem('vendora_session');
  } catch (e) {}
}
