// ============================================================
// settings.js — Settings Page Logic
// ============================================================
// This file handles the Settings page client-side behavior.
// It loads the current user's profile data, saves account settings,
// updates passwords, and manages local accessibility/notification toggles.
// It also allows deleting the account through the backend.
// ============================================================

// Wait for the DOM to load before running any scripts
document.addEventListener('DOMContentLoaded', () => {
  loadUserProfile();
  setupAccountForm();
  setupPasswordForm();
  setupSettingsToggles();
  setupDeleteAccount();
  setupProfileButton();
  setupLogoutButton();
  setupBackButton();
  setupHeaderNavigation();
  setupExportData();
  setupSavePreferencesButton();
  applyAccessibilitySettings();
});

// Load the current user's profile data from the backend and populate the form fields
async function loadUserProfile() {
  try {
    const response = await fetch('/api/auth/me');
    if (!response.ok) {
      window.location.href = '/';
      return;
    }

    const data = await response.json();
    const user = data.user;
    const firstName = user.real_name ? user.real_name.split(' ')[0] : user.username;

    // Update the greeting in the shared header
    const greeting = document.getElementById('user-greeting');
    if (greeting) {
      greeting.textContent = `Hey, ${firstName}`;
    }

    // Populate account form fields
    document.getElementById('settings-real-name').value = user.real_name || '';
    document.getElementById('settings-username').value = user.username || '';
    document.getElementById('settings-email').value = user.email || '';
  } catch (error) {
    console.error('Failed to load settings profile:', error);
    window.location.href = '/';
  }
}

// Set up event listeners for the profile button in the header
// This allows users to click their name in the header to go to settings from anywhere
function setupProfileButton() {
  const profileButton = document.getElementById('profile-btn');
  if (!profileButton) return;
  profileButton.addEventListener('click', () => {
    window.location.href = '/settings';
  });
}
// Set up the logout button to call the backend logout route and redirect to login page
function setupLogoutButton() {
  const logoutBtn = document.getElementById('logout-btn');
  if (!logoutBtn) return;

  logoutBtn.addEventListener('click', async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/';
  });
}
// Set up the account settings form to submit changes to the backend
// It requires the current password for confirmation and updates local preferences for toggles
function setupAccountForm() {
  const form = document.getElementById('account-form');
  const message = document.getElementById('account-form-message');

  if (!form || !message) return;

// When the account form is submitted, send a PUT request to update the profile
// The backend will validate the current password and update the profile if valid
// On success, it also saves the local preferences for toggles and shows a success message
// On failure, it shows the error message returned by the backend or a generic error
// Note: The backend route /api/auth/profile expects real_name, username, email, and current_password in the request body
// The backend will handle validation and updating the user's profile in the database  
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    message.textContent = '';

    const realName = document.getElementById('settings-real-name').value.trim();
    const username = document.getElementById('settings-username').value.trim();
    const email = document.getElementById('settings-email').value.trim();
    const currentPassword = document.getElementById('settings-current-password').value;
    const gender = document.getElementById('settings-gender').value;
    const dob = document.getElementById('settings-dob').value;
    const units = document.getElementById('settings-units').value;
    const workoutView = document.getElementById('settings-workout-view').value;
    const showTimer = document.getElementById('settings-show-timer').value;

    if (!currentPassword) {
      message.textContent = 'Please enter your current password to confirm changes.';
      return;
    }

    try {
      const response = await fetch('/api/auth/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          real_name: realName,
          username,
          email,
          current_password: currentPassword
        })
      });

      const result = await response.json();
      if (!response.ok) {
        message.textContent = result.error || 'Failed to save account settings.';
        return;
      }
// Save local preferences for toggles and other settings that don't require backend storage
      saveLocalPreferences({ gender, dob, units, workoutView, showTimer });
      message.textContent = 'Account settings saved successfully.';
    } catch (error) {
      message.textContent = 'Unable to save account settings right now.';
      console.error(error);
    }
  });
}

function setupBackButton() {
  const backButton = document.getElementById('settings-back-btn');
  if (!backButton) return;

  backButton.addEventListener('click', () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.href = '/dashboard';
    }
  });
}

function setupHeaderNavigation() {
  document.querySelectorAll('.header-nav .nav-btn').forEach((button) => {
    button.addEventListener('click', () => {
      const section = button.dataset.section;
      const target = section ? `/dashboard?section=${encodeURIComponent(section)}` : '/dashboard';
      window.location.href = target;
    });
  });
}
// Set up the "Save Preferences" button to save all toggle settings to localStorage
function setupSavePreferencesButton() {
  const button = document.getElementById('save-preferences-btn');
  const message = document.getElementById('preferences-message');
  if (!button || !message) return;

  button.addEventListener('click', () => {
    const keys = [
      'workout_reminders',
      'goal_reminders',
      'social_notifications',
      'email_notifications',
      'push_notifications',
      'auto_share',
      'large_text',
      'system_text',
      'high_contrast',
      'reduced_motion',
      'dark_mode',
      'haptic_feedback',
      'confirm_discard',
      'simple_cards'
    ];

    const values = {};
    keys.forEach((key) => {
      const input = document.getElementById(`settings-${key.replace(/_/g, '-')}`);
      if (input) {
        values[key] = input.checked;
      }
    });

    saveLocalPreferences(values);
    message.textContent = 'Preferences saved locally.';
    message.className = 'form-message success';
  });
}

function setupExportData() {
  const button = document.getElementById('export-data-btn');
  const message = document.getElementById('export-message');
  if (!button || !message) return;

  button.addEventListener('click', () => {
    const exportData = {
      profile: {
        real_name: document.getElementById('settings-real-name').value,
        username: document.getElementById('settings-username').value,
        email: document.getElementById('settings-email').value
      },
      preferences: loadLocalPreferences()
    };
// Create a JSON blob and trigger a download of the settings as a .json file
// This allows users to have a local backup of their settings, which they can re-import later if we add that feature
// Note: This only exports the profile info currently on the form and the local preferences, not the full workout data or history
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'healthtracker-settings.json';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);

    message.textContent = 'Settings exported locally as JSON.';
    message.className = 'form-message success';
  });
}

function setupPasswordForm() {
  const form = document.getElementById('password-form');
  const message = document.getElementById('password-form-message');

  if (!form || !message) return;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    message.textContent = '';

    const currentPassword = document.getElementById('current-password').value;
    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;

    if (newPassword !== confirmPassword) {
      message.textContent = 'New password and confirmation do not match.';
      return;
    }

    try {
      const response = await fetch('/api/auth/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword })
      });
      const result = await response.json();
      if (!response.ok) {
        message.textContent = result.error || 'Failed to change password.';
        return;
      }
      message.textContent = 'Password changed successfully.';
      form.reset();
    } catch (error) {
      message.textContent = 'Unable to change password right now.';
      console.error(error);
    }
  });
}
// Set up the toggle switches for various settings and save their state to localStorage
// This allows users to have their preferences for notifications and accessibility saved locally in the browser
function setupSettingsToggles() {
  const keys = [
    'workout_reminders',
    'goal_reminders',
    'social_notifications',
    'email_notifications',
    'push_notifications',
    'auto_share',
    'large_text',
    'system_text',
    'high_contrast',
    'reduced_motion',
    'dark_mode',
    'haptic_feedback',
    'confirm_discard',
    'simple_cards'
  ];

  const storage = loadLocalPreferences();
  keys.forEach((key) => {
    const input = document.getElementById(`settings-${key.replace(/_/g, '-')}`);
    if (!input) return;

    if (storage[key] !== undefined) {
      input.checked = storage[key];
    }

    input.addEventListener('change', () => {
      const updated = loadLocalPreferences();
      updated[key] = input.checked;
      localStorage.setItem('healthTrackerSettings', JSON.stringify(updated));
      applyAccessibilitySettings();
    });
  });
}

// Set up the delete account button to call the backend route to delete the user's account
// It shows a confirmation dialog before proceeding and handles the response to either redirect or show an error
function setupDeleteAccount() {
  const button = document.getElementById('delete-account-btn');
  if (!button) return;

  button.addEventListener('click', async () => {
    const confirmDelete = window.confirm('Delete your account and all your data? This cannot be undone.');
    if (!confirmDelete) return;

    try {
      const response = await fetch('/api/auth/delete-account', { method: 'DELETE' });
      if (response.ok) {
        window.location.href = '/';
      } else {
        const result = await response.json();
        alert(result.error || 'Could not delete account.');
      }
    } catch (error) {
      console.error('Delete account failed:', error);
      alert('Unable to delete account right now.');
    }
  });
}

function loadLocalPreferences() {
  try {
    return JSON.parse(localStorage.getItem('healthTrackerSettings')) || {};
  } catch {
    return {};
  }
}

function saveLocalPreferences(values) {
  const current = loadLocalPreferences();
  localStorage.setItem('healthTrackerSettings', JSON.stringify({ ...current, ...values }));
}

function applyAccessibilitySettings() {
  const prefs = loadLocalPreferences();
  const body = document.body;

  // Remove existing classes
  body.classList.remove('large-text', 'high-contrast', 'dark-mode', 'reduced-motion', 'simple-cards', 'system-text');

  // Apply based on preferences
  if (prefs.large_text) body.classList.add('large-text');
  if (prefs.high_contrast) body.classList.add('high-contrast');
  if (prefs.dark_mode) body.classList.add('dark-mode');
  if (prefs.reduced_motion) body.classList.add('reduced-motion');
  if (prefs.simple_cards) body.classList.add('simple-cards');
  if (prefs.system_text) body.classList.add('system-text');
}
