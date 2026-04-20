// ============================================================
// auth.js — Login & Registration Page Logic
// ============================================================
// This file handles everything that happens on the login/register
// page (public/index.html):
//
//   1. Switching between the Login and Register tabs
//   2. Submitting the login form and redirecting to dashboard
//   3. Submitting the registration form
//   4. Showing helpful success/error messages on screen
//
// HOW THIS FILE CONNECTS TO THE HTML:
//   index.html loads this file via:  <script src="/js/auth.js">
//   This file finds HTML elements by their id attributes,
//   e.g. document.getElementById('login-form') finds:
//   <form id="login-form"> in index.html
//
// HOW THIS FILE TALKS TO THE BACKEND:
//   We use the Fetch API — a built-in browser tool that sends
//   HTTP requests to our Express server and reads the response.
//   Think of fetch() like sending a letter to the server and
//   waiting for a reply without refreshing the page.
// ============================================================


// ── WAIT FOR THE PAGE TO FULLY LOAD ─────────────────────────
// DOMContentLoaded fires when the browser has finished reading
// and building the HTML. We wait for this before running our
// code so all elements (forms, buttons, etc.) exist when we
// try to find them with getElementById or querySelector.
document.addEventListener('DOMContentLoaded', () => {

  // ── FIND HTML ELEMENTS ─────────────────────────────────
  // We store references to elements we'll use repeatedly.
  // It's more efficient to find them once than to search every time.

  // Tab buttons (Login / Sign Up)
  const tabButtons   = document.querySelectorAll('.tab-btn');

  // The form panels that swap in and out
  const loginPanel   = document.getElementById('panel-login');
  const registerPanel= document.getElementById('panel-register');

  // The actual forms
  const loginForm    = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');

  // Feedback message paragraphs (where we show errors or success text)
  const loginMsg     = document.getElementById('login-message');
  const registerMsg  = document.getElementById('register-message');

  // Submit buttons (we disable them while a request is in progress)
  const loginBtn     = document.getElementById('login-submit-btn');
  const registerBtn  = document.getElementById('register-submit-btn');


  // ── TAB SWITCHING ──────────────────────────────────────
  // When the user clicks "Log In" or "Sign Up", we:
  //   1. Mark the clicked tab as active (changes its style in CSS)
  //   2. Show the matching panel
  //   3. Hide the other panel

  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const targetTab = button.dataset.tab; // 'login' or 'register'

      // Update all tab button states
      tabButtons.forEach(btn => {
        btn.classList.remove('active');
        btn.setAttribute('aria-selected', 'false');
      });

      // Mark the clicked tab as active
      button.classList.add('active');
      button.setAttribute('aria-selected', 'true');

      // Show the correct panel, hide the other
      if (targetTab === 'login') {
        loginPanel.hidden    = false;
        registerPanel.hidden = true;
        loginPanel.classList.add('active');
        registerPanel.classList.remove('active');
      } else {
        loginPanel.hidden    = true;
        registerPanel.hidden = false;
        registerPanel.classList.add('active');
        loginPanel.classList.remove('active');
      }

      // Clear any leftover messages when switching tabs
      clearMessage(loginMsg);
      clearMessage(registerMsg);
    });
  });


  // ── LOGIN FORM SUBMISSION ──────────────────────────────
  // We listen for the 'submit' event on the login form.
  // event.preventDefault() stops the browser from reloading the page
  // (which is the default behaviour for form submissions).
  // Instead, we handle everything with JavaScript.

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault(); // Stop the browser's default form submission

    // Get the values the user typed into the form fields
    // FormData reads all named inputs from the form automatically
    const formData = new FormData(loginForm);
    const email    = formData.get('email').trim();
    const password = formData.get('password');

    // Quick client-side validation before hitting the server
    if (!email || !password) {
      showMessage(loginMsg, 'Please enter your email and password.', 'error');
      return; // Stop here — don't send the request
    }

    // Disable the button and show "Loading..." to prevent double submissions
    // (clicking twice would send two requests)
    setLoading(loginBtn, true, 'Logging in...');
    clearMessage(loginMsg);

    try {
      // Send a POST request to /api/auth/login with the form data as JSON.
      // fetch() is asynchronous — 'await' pauses until the server responds.
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }, // Tell the server we're sending JSON
        body: JSON.stringify({ email, password })          // Convert the JS object to a JSON string
      });

      // response.json() reads the response body and parses it as JSON.
      // This gives us the object our server returned (e.g. { message, user } or { error })
      const data = await response.json();

      if (response.ok) {
        // HTTP 200–299 = success
        // The server has set a session cookie in the browser automatically.
        // Now we just redirect to the dashboard.
        showMessage(loginMsg, 'Login successful! Redirecting...', 'success');

        // Wait 500ms so the user sees the success message, then navigate
        setTimeout(() => {
          window.location.href = '/dashboard';
        }, 500);

      } else {
        // HTTP 400, 401, 409, etc. = the server rejected the request
        // data.error contains the message our server sent back
        showMessage(loginMsg, data.error || 'Login failed. Please try again.', 'error');
        setLoading(loginBtn, false, 'Log In');
      }

    } catch (networkError) {
      // This catches genuine network failures (e.g. the server is off)
      // rather than logical errors handled above
      console.error('Login network error:', networkError);
      showMessage(loginMsg, 'Network error — is the server running?', 'error');
      setLoading(loginBtn, false, 'Log In');
    }
  });


  // ── REGISTRATION FORM SUBMISSION ───────────────────────
  registerForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    // Collect all form field values
    const formData  = new FormData(registerForm);
    const username  = formData.get('username').trim();
    const real_name = formData.get('real_name').trim();
    const email     = formData.get('email').trim();
    const password  = formData.get('password');
    const height_cm = formData.get('height_cm') || null;
    const weight_kg = formData.get('weight_kg') || null;
    const age       = formData.get('age') || null;

    // Client-side validation — catch obvious errors before hitting the server
    if (!username || !real_name || !email || !password) {
      showMessage(registerMsg, 'Please fill in all required fields.', 'error');
      return;
    }

    if (password.length < 6) {
      showMessage(registerMsg, 'Password must be at least 6 characters.', 'error');
      return;
    }

    setLoading(registerBtn, true, 'Creating account...');
    clearMessage(registerMsg);

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, real_name, email, password, height_cm, weight_kg, age })
      });

      const data = await response.json();

      if (response.ok) {
        showMessage(registerMsg, 'Account created! Redirecting to your dashboard...', 'success');

        setTimeout(() => {
          window.location.href = '/dashboard';
        }, 800);

      } else {
        showMessage(registerMsg, data.error || 'Registration failed. Please try again.', 'error');
        setLoading(registerBtn, false, 'Create Account');
      }

    } catch (networkError) {
      console.error('Registration network error:', networkError);
      showMessage(registerMsg, 'Network error — is the server running?', 'error');
      setLoading(registerBtn, false, 'Create Account');
    }
  });


  // ── HELPER FUNCTIONS ───────────────────────────────────
  // Small reusable functions that handle repetitive UI tasks.
  // Putting them here avoids repeating the same code in multiple places.

  /**
   * showMessage — displays a feedback message below a form.
   * @param {HTMLElement} element  - The <p> element to write into
   * @param {string}      message  - The text to display
   * @param {string}      type     - 'success' or 'error' (controls colour via CSS class)
   */
  function showMessage(element, message, type) {
    element.textContent = message;
    element.className   = `form-message ${type}`; // CSS classes control the colour
  }

  /**
   * clearMessage — removes any feedback message from an element.
   * @param {HTMLElement} element - The message element to clear
   */
  function clearMessage(element) {
    element.textContent = '';
    element.className   = 'form-message';
  }

  /**
   * setLoading — toggles a button's loading state.
   * When loading=true: disables the button and changes its text.
   * When loading=false: re-enables it and restores the label.
   *
   * This prevents users from clicking the button multiple times
   * while waiting for the server to respond.
   *
   * @param {HTMLButtonElement} button       - The button to toggle
   * @param {boolean}           isLoading    - Whether to show loading state
   * @param {string}            loadingLabel - Text to show while loading
   */
  function setLoading(button, isLoading, loadingLabel) {
    button.disabled     = isLoading;
    button.textContent  = loadingLabel;
  }

}); // End of DOMContentLoaded