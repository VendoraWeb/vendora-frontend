// API Configuration
export const BASE_URL = 'https://vendora-backend-zeta.vercel.app/api';

// Helper to get active session user
export function getActiveSession() {
  const sessionStr = sessionStorage.getItem('vendora_session');
  if (!sessionStr) return null;
  try {
    return JSON.parse(sessionStr);
  } catch (e) {
    return null;
  }
}

// Helper to set active session
export function setActiveSession(sessionData) {
  sessionStorage.setItem('vendora_session', JSON.stringify(sessionData));
}

// Helper to clear session
export function clearActiveSession() {
  sessionStorage.removeItem('vendora_session');
}
