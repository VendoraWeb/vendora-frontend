// API Configuration
export const BASE_URL = 'https://beba6dcc-c2b4-4b06-afdf-e9b1e149fe53-00-32kp8du4hszfz.pike.replit.dev/api';

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
