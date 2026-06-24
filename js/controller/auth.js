import { getValue, onClick } from "https://cdn.jsdelivr.net/gh/jscroot/element@0.1.5/croot.js";
import { BASE_URL, setActiveSession } from "../config/api.js";

// ─── Alert helper ──────────────────────────────────────────────────────────
function showAlert(message, type) {
  const container = document.getElementById('alert-container') || document.body;
  const alertDiv = document.createElement('div');
  alertDiv.className = `alert alert-${type}`;
  alertDiv.textContent = message;
  container.prepend(alertDiv);
  setTimeout(() => alertDiv.remove(), 4000);
}

// ─── Redirect after login ───────────────────────────────────────────────────
function redirectByRole(role) {
  const routes = { admin: 'admin.html', seller: 'seller.html', buyer: 'index.html' };
  window.location.href = routes[role] || 'index.html';
}

// ─── Main auth initializer ──────────────────────────────────────────────────
export function initAuth() {
  const signinView  = document.getElementById('signin-view');
  const signupView  = document.getElementById('signup-view');
  const tabSignin   = document.getElementById('tab-signin');
  const tabSignup   = document.getElementById('tab-signup');

  const loginForm    = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const googleBtn    = document.getElementById('google-login-btn');

  // ── Tab switching helper ──────────────────────────────────────────────────
  function showSignIn() {
    signinView.style.display = 'block';
    signupView.style.display = 'none';
    tabSignin.classList.add('active');
    tabSignup.classList.remove('active');
    tabSignin.setAttribute('aria-selected', 'true');
    tabSignup.setAttribute('aria-selected', 'false');
  }

  function showSignUp() {
    signinView.style.display = 'none';
    signupView.style.display = 'block';
    tabSignup.classList.add('active');
    tabSignin.classList.remove('active');
    tabSignup.setAttribute('aria-selected', 'true');
    tabSignin.setAttribute('aria-selected', 'false');
  }

  // Tab buttons
  if (tabSignin) tabSignin.addEventListener('click', showSignIn);
  if (tabSignup) tabSignup.addEventListener('click', showSignUp);

  // In-text toggle links
  const toSignupLink = document.getElementById('to-signup-link');
  const toSigninLink = document.getElementById('to-signin-link');
  if (toSignupLink) toSignupLink.addEventListener('click', (e) => { e.preventDefault(); showSignUp(); });
  if (toSigninLink) toSigninLink.addEventListener('click', (e) => { e.preventDefault(); showSignIn(); });

  // ── Login form ────────────────────────────────────────────────────────────
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const submitBtn = document.getElementById('signin-submit-btn');
      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Signing in...'; }

      const email    = getValue('login-email');
      const password = getValue('login-password');

      try {
        const res  = await fetch(`${BASE_URL}/login`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ email, password })
        });
        const data = await res.json();

        if (data.status === 200) {
          showAlert("Login successful! Redirecting...", "success");
          setActiveSession({ token: data.data.token, user: data.data.user });
          setTimeout(() => redirectByRole(data.data.user.role), 1200);
        } else {
          showAlert(data.message || "Invalid credentials. Please try again.", "error");
          if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Sign In'; }
        }
      } catch (err) {
        console.error(err);
        showAlert("Connection error. Is the backend server running?", "error");
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Sign In'; }
      }
    });
  }

  // ── Register form ─────────────────────────────────────────────────────────
  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const submitBtn = document.getElementById('signup-submit-btn');
      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Creating account...'; }

      const name     = getValue('reg-name');
      const email    = getValue('reg-email');
      const password = getValue('reg-password');
      const role     = getValue('reg-role');

      try {
        const res  = await fetch(`${BASE_URL}/register`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ name, email, password, role })
        });
        const data = await res.json();

        if (data.status === 201) {
          showAlert("Account created! Please sign in.", "success");
          registerForm.reset();
          setTimeout(() => showSignIn(), 1200);
        } else {
          showAlert(data.message || "Registration failed. Email may already be in use.", "error");
        }
      } catch (err) {
        console.error(err);
        showAlert("Connection error. Is the backend server running?", "error");
      } finally {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Create Account'; }
      }
    });
  }

  // ── Google Sign-In (simulated OAuth flow via backend) ────────────────────
  if (googleBtn) {
    googleBtn.addEventListener('click', async () => {
      googleBtn.disabled = true;
      googleBtn.style.opacity = '0.7';

      // In a real app this redirects to Google OAuth. Here we simulate it.
      const mockEmail    = "nabila.google@gmail.com";
      const mockPassword = "googlemock@vendora2024";

      try {
        // Attempt register (idempotent — backend returns 409 if exists, we ignore)
        await fetch(`${BASE_URL}/register`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            name:     "Nabila Google User",
            email:    mockEmail,
            password: mockPassword,
            role:     "buyer"
          })
        }).catch(() => {});

        // Now log in
        const res  = await fetch(`${BASE_URL}/login`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ email: mockEmail, password: mockPassword })
        });
        const data = await res.json();

        if (data.status === 200) {
          showAlert("Google sign-in successful! Redirecting...", "success");
          setActiveSession({ token: data.data.token, user: data.data.user });
          setTimeout(() => redirectByRole(data.data.user.role), 1200);
        } else {
          showAlert("Google sign-in failed. Please try email login.", "error");
          googleBtn.disabled = false;
          googleBtn.style.opacity = '1';
        }
      } catch (err) {
        console.error(err);
        showAlert("Cannot connect to server for Google auth.", "error");
        googleBtn.disabled = false;
        googleBtn.style.opacity = '1';
      }
    });
  }
}
