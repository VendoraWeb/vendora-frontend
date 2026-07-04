// API Configuration
export const BASE_URL = 'http://localhost:8081/api';

// Helper to get active session user
export function getActiveSession() {
  const sessionStr = localStorage.getItem('vendora_session');
  if (!sessionStr) return null;
  try {
    return JSON.parse(sessionStr);
  } catch (e) {
    return null;
  }
}

// Helper to set active session
export function setActiveSession(sessionData) {
  localStorage.setItem('vendora_session', JSON.stringify(sessionData));
}

// Helper to clear session
export function clearActiveSession() {
  localStorage.removeItem('vendora_session');
}
