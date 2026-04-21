// ============================================================
// dashboard.js — Dashboard Page Logic
// ============================================================
// This is the brain of the dashboard (public/dashboard.html).
// It runs after the page loads and handles everything the user
// sees and does once they're logged in:
//
//   ► Loading the user's profile and greeting them by name
//   ► Navigation — switching between sections (Overview, Exercise, etc.)
//   ► Exercise form — logging cardio and strength workouts
//   ► Diet form — logging meals and food entries
//   ► Goals — setting and viewing health targets
//   ► Stats — loading weekly summaries
//   ► Groups — creating, joining, and leaving groups
//   ► Logout button
//
// HOW IT CONNECTS TO THE HTML:
//   dashboard.html loads this file via: <script src="/js/dashboard.js">
//   This file finds elements by their id="" attributes and
//   listens for user interactions (clicks, form submissions).
//
// HOW IT TALKS TO THE BACKEND:
//   Every time we need data or want to save something, we use
//   the Fetch API to make HTTP requests to our Express server.
//   The server processes the request and returns JSON data.
// ============================================================


// ── WAIT FOR THE PAGE TO LOAD ────────────────────────────────
// Just like auth.js, we wait for DOMContentLoaded before
// running anything, so all the HTML elements exist first.
document.addEventListener('DOMContentLoaded', () => {

  // ── STEP 1: CHECK IF LOGGED IN ──────────────────────────
  // The first thing we do is ask the server "who is logged in?"
  // If the server says nobody is, we kick the user back to login.
  // This is a frontend security check — the backend also protects
  // routes, but this gives a smooth user experience.
  loadUserProfile();

  // ── STEP 2: SET UP NAVIGATION ───────────────────────────
  setupNavigation();

  // ── STEP 3: LOAD INITIAL DATA ───────────────────────────
  // Load the overview data so the dashboard isn't empty on arrival
  loadOverview();

  // ── STEP 4: WIRE UP ALL FORMS ───────────────────────────
  setupExerciseForm();
  setupDietForm();
  setupDietTabs();
  setupGoalsForm();
  setupGroupForms();

  // ── STEP 5: LOGOUT BUTTON ───────────────────────────────
  document.getElementById('logout-btn').addEventListener('click', handleLogout);


  // ============================================================
  // SECTION: User Profile
  // ============================================================

  /**
   * loadUserProfile — asks the server for the logged-in user's details.
   * If the server says we're not logged in, we redirect to the login page.
   * If we are logged in, we update the greeting in the header.
   */
  async function loadUserProfile() {
    try {
      const response = await fetch('/api/auth/me');

      if (!response.ok) {
        // The server returned 401 (not logged in) — go back to login
        window.location.href = '/';
        return;
      }

      const data = await response.json();
      const user = data.user;

      // Update the greeting in the top-right of the header
      // e.g. "Hey, Alex" — using their first name for a personal touch
      const firstName = user.real_name.split(' ')[0];
      document.getElementById('user-greeting').textContent = `Hey, ${firstName}`;

    } catch (error) {
      console.error('Failed to load profile:', error.message);
      // On network error, redirect to login to be safe
      window.location.href = '/';
    }
  }


  // ============================================================
  // SECTION: Navigation
  // ============================================================

  /**
   * setupNavigation — makes the nav buttons in the header work.
   * Clicking a nav button hides all sections and shows just the
   * one that matches the button's data-section attribute.
   */
  function setupNavigation() {
    const navButtons = document.querySelectorAll('.nav-btn');

    navButtons.forEach(button => {
      button.addEventListener('click', () => {
        const targetSection = button.dataset.section;

        // Remove 'active' from all nav buttons, then add it to the clicked one
        navButtons.forEach(btn => {
          btn.classList.remove('active');
          btn.removeAttribute('aria-current');
        });
        button.classList.add('active');
        button.setAttribute('aria-current', 'page');

        // Hide all sections, then show the target one
        // querySelectorAll returns a NodeList — we use forEach to loop over it
        document.querySelectorAll('.dash-section').forEach(section => {
          section.hidden = true;
        });

        const target = document.getElementById(`section-${targetSection}`);
        if (target) {
          target.hidden = false;
        }

        // Load fresh data when switching to certain sections
        // We don't want stale data showing from a previous visit
        if (targetSection === 'overview')  loadOverview();
        if (targetSection === 'exercise')  loadExerciseHistory();
        if (targetSection === 'diet')      loadTodaysDiet();
        if (targetSection === 'goals')     loadGoals();
        if (targetSection === 'stats')     loadStats();
        if (targetSection === 'groups')    loadGroups();
      });
    });
  }


  // ============================================================
  // SECTION: Overview
  // ============================================================

  /**
   * loadOverview — fetches all the summary data for the Overview section.
   * This runs on page load and again every time the Overview tab is clicked.
   * It fills in the stat cards and the activity lists at the top.
   */
  async function loadOverview() {
    try {
      // Run all three fetch requests at the same time using Promise.all
      // This is faster than doing them one after another
      // Promise.all waits for ALL of them to finish before continuing
      const [exerciseRes, dietRes, goalsRes] = await Promise.all([
        fetch('/api/exercise/today'),
        fetch('/api/diet/today'),
        fetch('/api/goals/list')
      ]);

      const exerciseData = await exerciseRes.json();
      const dietData     = await dietRes.json();
      const goalsData    = await goalsRes.json();

      // ── Fill in the stat cards ────────────────────────────
      const entries       = exerciseData.entries || [];
      const totalBurned   = entries.reduce((sum, e) => sum + (e.calories_burned || 0), 0);
      const totalConsumed = dietData.total_calories_today || 0;
      const activeGoals   = (goalsData.goals || []).filter(g => !g.is_met).length;

      document.getElementById('overview-cal-burned').textContent   = totalBurned;
      document.getElementById('overview-cal-consumed').textContent = totalConsumed;
      document.getElementById('overview-sessions').textContent     = entries.length;
      document.getElementById('overview-goals').textContent        = activeGoals;

      // ── Render today's exercise list ──────────────────────
      const exerciseList = document.getElementById('overview-exercise-list');
      if (entries.length === 0) {
        exerciseList.innerHTML = '<li class="empty-state">No exercise logged yet — get moving!</li>';
      } else {
        // Map each entry to an <li> and join them into one HTML string
        // This is a common pattern: build HTML as a string, then set innerHTML
        exerciseList.innerHTML = entries.map(entry => {
          const detail = entry.exercise_category === 'strength'
            ? buildStrengthDetail(entry)
            : buildCardioDetail(entry);
          return `
            <li data-entry-id="${entry.id}" class="activity-item-editable">
              <span>
                <strong>${entry.activity_name}</strong>
                <span class="activity-detail">${detail}</span>
              </span>
              <span class="activity-actions">
                <button class="btn-icon edit-exercise-btn" data-id="${entry.id}" title="Edit entry">✎</button>
                <span class="activity-tag">${entry.activity_type}</span>
              </span>
            </li>`;
        }).join('');
        
        // Add event listeners for edit buttons
        document.querySelectorAll('.edit-exercise-btn').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const entryId = btn.dataset.id;
            openEditExerciseModal(entryId);
          });
        });
      }

      // ── Render today's meal list ───────────────────────────
      const mealList  = document.getElementById('overview-meal-list');
      const meals     = dietData.entries || [];
      if (meals.length === 0) {
        mealList.innerHTML = '<li class="empty-state">No meals logged yet.</li>';
      } else {
        mealList.innerHTML = meals.map(meal => `
          <li data-entry-id="${meal.id}" class="activity-item-editable">
            <span>
              <strong>${meal.food_name}</strong>
              <span class="activity-detail">${meal.calories} kcal · ${meal.meal_type}</span>
            </span>
            <span class="activity-actions">
              <button class="btn-icon edit-meal-btn" data-id="${meal.id}" title="Edit entry">✎</button>
              <span class="activity-tag">${meal.meal_type}</span>
            </span>
          </li>`
        ).join('');
        
        // Add event listeners for edit buttons
        document.querySelectorAll('.edit-meal-btn').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const entryId = btn.dataset.id;
            openEditMealModal(entryId);
          });
        });
      }

    } catch (error) {
      console.error('Overview load error:', error.message);
    }
  }

  // Helper: build a text description for a strength exercise entry
  function buildStrengthDetail(entry) {
    const parts = [];
    if (entry.sets && entry.reps) parts.push(`${entry.sets} × ${entry.reps} reps`);
    if (entry.weight_kg_used)     parts.push(`${entry.weight_kg_used}kg`);
    if (entry.calories_burned)    parts.push(`${entry.calories_burned} kcal`);
    return parts.join(' · ') || 'Strength training';
  }

  // Helper: build a text description for a cardio exercise entry
  function buildCardioDetail(entry) {
    const parts = [];
    if (entry.duration_mins)  parts.push(`${entry.duration_mins} mins`);
    if (entry.distance_km)    parts.push(`${entry.distance_km}km`);
    if (entry.calories_burned) parts.push(`${entry.calories_burned} kcal`);
    return parts.join(' · ') || 'Cardio session';
  }


  // ============================================================
  // SECTION: Exercise Form
  // ============================================================

  /**
   * setupExerciseForm — wires up the exercise logging form.
   * Handles:
   *   - Toggling between Cardio and Strength fields
   *   - Form submission to POST /api/exercise/log
   */
  function setupExerciseForm() {
    const form         = document.getElementById('exercise-form');
    const cardioBtn    = document.getElementById('toggle-cardio');
    const strengthBtn  = document.getElementById('toggle-strength');
    const cardioFields = document.getElementById('cardio-fields');
    const strFields    = document.getElementById('strength-fields');
    const msgEl        = document.getElementById('exercise-message');
    const submitBtn    = document.getElementById('exercise-submit-btn');

    // We store which category is currently selected as a variable
    // so the submit handler can read it when building the request
    let currentCategory = 'cardio';

    // ── Category toggle buttons ────────────────────────────
    // When the user clicks "Cardio", show cardio fields and hide strength fields
    cardioBtn.addEventListener('click', () => {
      currentCategory = 'cardio';
      cardioBtn.classList.add('active');
      strengthBtn.classList.remove('active');
      cardioFields.hidden = false;
      strFields.hidden    = true;
    });

    // When they click "Strength", swap which fields are visible
    strengthBtn.addEventListener('click', () => {
      currentCategory = 'strength';
      strengthBtn.classList.add('active');
      cardioBtn.classList.remove('active');
      strFields.hidden    = false;
      cardioFields.hidden = true;
    });

    // ── Form submission ─────────────────────────────────────
    form.addEventListener('submit', async (event) => {
      event.preventDefault(); // Stop the browser refreshing the page

      // Collect all form values
      const formData = new FormData(form);

      // Build the request body object
      // We only include fields relevant to the selected category
      const body = {
        activity_type:     formData.get('activity_type'),
        activity_name:     formData.get('activity_name'),
        exercise_category: currentCategory,
        calories_burned:   formData.get('calories_burned') || null
      };

      // Add cardio-specific or strength-specific fields
      if (currentCategory === 'cardio') {
        body.duration_mins = formData.get('duration_mins') || null;
        body.distance_km   = formData.get('distance_km')   || null;
      } else {
        body.sets           = formData.get('sets')           || null;
        body.reps           = formData.get('reps')           || null;
        body.weight_kg_used = formData.get('weight_kg_used') || null;
      }

      // Quick validation — at minimum we need a type and name
      if (!body.activity_type || !body.activity_name) {
        showMessage(msgEl, 'Please select an activity type and enter a name.', 'error');
        return;
      }

      setLoading(submitBtn, true, 'Saving...');
      clearMessage(msgEl);

      try {
        const response = await fetch('/api/exercise/log', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(body)
        });

        const data = await response.json();

        if (response.ok) {
          showMessage(msgEl, 'Exercise logged successfully!', 'success');
          form.reset(); // Clear all fields after a successful save
          loadExerciseHistory(); // Refresh the list below the form
        } else {
          showMessage(msgEl, data.error || 'Failed to log exercise.', 'error');
        }

      } catch (error) {
        console.error('Exercise submit error:', error.message);
        showMessage(msgEl, 'Network error. Please try again.', 'error');
      } finally {
        // 'finally' runs whether the request succeeded or failed
        // We always re-enable the button so the user can try again
        setLoading(submitBtn, false, 'Log Exercise');
      }
    });
  }

  /**
   * loadExerciseHistory — fetches the last 20 exercise entries and
   * renders them in the "Recent History" list on the Exercise section.
   */
  async function loadExerciseHistory() {
    try {
      const response = await fetch('/api/exercise/history?limit=20');
      const data     = await response.json();

      const list = document.getElementById('exercise-history-list');
      const entries = data.entries || [];

      if (entries.length === 0) {
        list.innerHTML = '<li class="empty-state">No exercise recorded yet.</li>';
        return;
      }

      list.innerHTML = entries.map(entry => {
        // Format the date nicely — toLocaleDateString() gives "20 Apr 2026" style
        const date   = new Date(entry.logged_at).toLocaleDateString('en-GB', {
          day: 'numeric', month: 'short'
        });
        const detail = entry.exercise_category === 'strength'
          ? buildStrengthDetail(entry)
          : buildCardioDetail(entry);

        return `
          <li>
            <span>
              <strong>${entry.activity_name}</strong>
              <span class="activity-detail">${detail} · ${date}</span>
            </span>
            <span class="activity-tag">${entry.exercise_category}</span>
          </li>`;
      }).join('');

    } catch (error) {
      console.error('Exercise history error:', error.message);
    }
  }


  // ============================================================
  // SECTION: Diet Form
  // ============================================================

  /**
   * setupDietForm — wires up the meal logging form and the custom
   * food item form.
   */
  function setupDietForm() {
    const dietForm   = document.getElementById('diet-form');
    const msgEl      = document.getElementById('diet-message');
    const submitBtn  = document.getElementById('diet-submit-btn');
    const feedback   = document.getElementById('calorie-goal-feedback');

    // ── Food name autocomplete ──────────────────────────────
    // When the user types in the food name field, show a dropdown with suggestions
    const foodInput        = document.getElementById('diet-food-name');
    const suggestionsDiv   = document.getElementById('food-suggestions-dropdown');
    const caloriesInput    = document.getElementById('diet-calories');

    let currentSuggestions = [];
    let selectedIndex      = -1;

    // Position the dropdown relative to the input
    foodInput.parentElement.style.position = 'relative';

    // We debounce the input — wait 300ms after typing stops before searching
    let searchTimeout;
    foodInput.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(async () => {
        const query = foodInput.value.trim();
        selectedIndex = -1;

        if (query.length < 1) {
          suggestionsDiv.style.display = 'none';
          return;
        }

        try {
          const response = await fetch(`/api/diet/foods?search=${encodeURIComponent(query)}`);
          const data     = await response.json();

          currentSuggestions = data.foods || [];

          if (currentSuggestions.length > 0) {
            // Show dropdown with suggestions
            suggestionsDiv.innerHTML = currentSuggestions
              .map((food, index) => `<div class="suggestion-item" data-index="${index}" data-calories="${food.calories}">${food.name}</div>`)
              .join('');
            suggestionsDiv.style.display = 'block';
          } else {
            suggestionsDiv.style.display = 'none';
          }
        } catch (error) {
          console.error('Food search error:', error);
          suggestionsDiv.style.display = 'none';
        }
      }, 300);
    });

    // Handle clicking on suggestions
    suggestionsDiv.addEventListener('click', (event) => {
      if (event.target.classList.contains('suggestion-item')) {
        const index = parseInt(event.target.dataset.index);
        const food = currentSuggestions[index];
        selectSuggestion(food);
      }
    });

    // Handle keyboard navigation
    foodInput.addEventListener('keydown', (event) => {
      if (suggestionsDiv.style.display === 'none') return;

      const items = suggestionsDiv.querySelectorAll('.suggestion-item');

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
        updateHighlight();
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        selectedIndex = Math.max(selectedIndex - 1, -1);
        updateHighlight();
      } else if (event.key === 'Enter' && selectedIndex >= 0) {
        event.preventDefault();
        const food = currentSuggestions[selectedIndex];
        selectSuggestion(food);
      } else if (event.key === 'Escape') {
        suggestionsDiv.style.display = 'none';
        selectedIndex = -1;
      }
    });

    // Hide dropdown when clicking outside
    document.addEventListener('click', (event) => {
      if (!foodInput.parentElement.contains(event.target)) {
        suggestionsDiv.style.display = 'none';
        selectedIndex = -1;
      }
    });

    function selectSuggestion(food) {
      foodInput.value = food.name;
      caloriesInput.value = food.calories;
      suggestionsDiv.style.display = 'none';
      selectedIndex = -1;
      // Focus on the meal type select for better UX
      document.getElementById('diet-meal-type').focus();
    }

    function updateHighlight() {
      const items = suggestionsDiv.querySelectorAll('.suggestion-item');
      items.forEach((item, index) => {
        item.classList.toggle('highlighted', index === selectedIndex);
      });
    }

    // ── Main diet form submission ──────────────────────────
    dietForm.addEventListener('submit', async (event) => {
      event.preventDefault();

      const formData  = new FormData(dietForm);
      const food_name = formData.get('food_name').trim();
      const meal_type = formData.get('meal_type');
      const calories  = formData.get('calories');
      const quantity  = formData.get('quantity') || 1;

      if (!food_name || !meal_type || !calories) {
        showMessage(msgEl, 'Food name, meal type and calories are all required.', 'error');
        return;
      }

      setLoading(submitBtn, true, 'Saving meal...');
      clearMessage(msgEl);
      feedback.textContent = '';
      feedback.className   = 'goal-feedback';

      try {
        const response = await fetch('/api/diet/log', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ food_name, meal_type, calories, quantity })
        });

        const data = await response.json();

        if (response.ok) {
          showMessage(msgEl, 'Meal logged!', 'success');
          dietForm.reset();

          // Reload today's total and check against a rough daily goal (2000 kcal)
          // This matches the Miro wireframe which shows goal feedback after logging
          loadTodaysDiet().then(total => {
            const dailyGoal = 2000; // A sensible default — ideally this would be per-user
            const remaining = dailyGoal - total;

            if (remaining >= 0) {
              feedback.textContent = `You have ${remaining} calories remaining today (goal: ${dailyGoal} kcal).`;
              feedback.className   = 'goal-feedback under';
            } else {
              feedback.textContent = `You are ${Math.abs(remaining)} calories over your daily goal.`;
              feedback.className   = 'goal-feedback over';
            }
          });

        } else {
          showMessage(msgEl, data.error || 'Failed to log meal.', 'error');
        }

      } catch (error) {
        console.error('Diet submit error:', error.message);
        showMessage(msgEl, 'Network error. Please try again.', 'error');
      } finally {
        setLoading(submitBtn, false, 'Log Meal');
      }
    });

    // ── Custom food form ───────────────────────────────────
    const customFoodForm = document.getElementById('custom-food-form');
    const customFoodMsg  = document.getElementById('custom-food-message');

    customFoodForm.addEventListener('submit', async (event) => {
      event.preventDefault();

      const formData = new FormData(customFoodForm);
      const name     = formData.get('name').trim();
      const calories = formData.get('calories');

      if (!name || !calories) {
        showMessage(customFoodMsg, 'Food name and calories are required.', 'error');
        return;
      }

      try {
        const response = await fetch('/api/diet/foods/custom', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ name, calories })
        });

        const data = await response.json();

        if (response.ok) {
          showMessage(customFoodMsg, `"${name}" added to your food list!`, 'success');
          customFoodForm.reset();
        } else {
          showMessage(customFoodMsg, data.error || 'Failed to add food.', 'error');
        }

      } catch (error) {
        console.error('Custom food error:', error.message);
        showMessage(customFoodMsg, 'Network error. Please try again.', 'error');
      }
    });
  }

  /**
   * loadTodaysDiet — fetches today's meal entries and renders them.
   * Returns the total calories so the goal feedback can use it.
   *
   * @returns {Promise<number>} The total calories consumed today
   */
  async function loadTodaysDiet() {
    try {
      const response = await fetch('/api/diet/today');
      const data     = await response.json();

      const total   = data.total_calories_today || 0;
      const entries = data.entries || [];

      // Update the calorie total display
      document.getElementById('diet-daily-total').textContent = total;

      // Render the meal list
      const list = document.getElementById('diet-today-list');
      if (entries.length === 0) {
        list.innerHTML = '<li class="empty-state">No meals logged today.</li>';
      } else {
        list.innerHTML = entries.map(entry => `
          <li>
            <span>
              <strong>${entry.food_name}</strong>
              <span class="activity-detail">${entry.calories} kcal · ${entry.quantity} portion(s)</span>
            </span>
            <span class="activity-tag">${entry.meal_type}</span>
          </li>`
        ).join('');
      }

      // Return the total so the caller can use it
      return total;

    } catch (error) {
      console.error('Diet today error:', error.message);
      return 0;
    }
  }


  // ============================================================
  // SECTION: Diet Tabs
  // ============================================================

  /**
   * setupDietTabs — makes the diet tab buttons work.
   * Clicking a tab shows the corresponding panel.
   */
  function setupDietTabs() {
    const tabButtons = document.querySelectorAll('.diet-tab-btn');

    tabButtons.forEach(button => {
      button.addEventListener('click', () => {
        const targetTab = button.dataset.tab;

        // Update tab button states
        tabButtons.forEach(btn => {
          btn.classList.remove('active');
          btn.setAttribute('aria-selected', 'false');
        });

        button.classList.add('active');
        button.setAttribute('aria-selected', 'true');

        // Show the correct panel
        document.querySelectorAll('.diet-panel').forEach(panel => {
          panel.style.display = 'none';
          panel.classList.remove('active');
        });

        const targetPanel = document.getElementById(`panel-${targetTab}`);
        if (targetPanel) {
          targetPanel.style.display = 'flex';
          targetPanel.classList.add('active');
        }
      });
    });
  }


  // ============================================================
  // SECTION: Goals Form
  // ============================================================

  /**
   * setupGoalsForm — wires up the goal creation form.
   */
  function setupGoalsForm() {
    const form      = document.getElementById('goal-form');
    const msgEl     = document.getElementById('goal-message');
    const submitBtn = form.querySelector('button[type="submit"]');

    // Set the minimum date for the target date field to today
    // This prevents users from setting goals in the past
    const today = new Date().toISOString().split('T')[0]; // "YYYY-MM-DD"
    document.getElementById('goal-date').setAttribute('min', today);

    form.addEventListener('submit', async (event) => {
      event.preventDefault();

      const formData     = new FormData(form);
      const goal_type    = formData.get('goal_type');
      const target_value = formData.get('target_value');
      const target_date  = formData.get('target_date');
      const description  = formData.get('description') || null;

      if (!goal_type || !target_value || !target_date) {
        showMessage(msgEl, 'Goal type, target value and date are all required.', 'error');
        return;
      }

      setLoading(submitBtn, true, 'Saving goal...');
      clearMessage(msgEl);

      try {
        const response = await fetch('/api/goals/create', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ goal_type, target_value, target_date, description })
        });

        const data = await response.json();

        if (response.ok) {
          showMessage(msgEl, 'Goal set! Go get it.', 'success');
          form.reset();
          loadGoals(); // Refresh the goals list
        } else {
          showMessage(msgEl, data.error || 'Failed to create goal.', 'error');
        }

      } catch (error) {
        console.error('Goal create error:', error.message);
        showMessage(msgEl, 'Network error. Please try again.', 'error');
      } finally {
        setLoading(submitBtn, false, 'Set Goal');
      }
    });
  }

  /**
   * loadGoals — fetches the user's goals and renders them with progress bars.
   */
  async function loadGoals() {
    try {
      const response = await fetch('/api/goals/list');
      const data     = await response.json();

      const list  = document.getElementById('goals-list');
      const goals = data.goals || [];

      if (goals.length === 0) {
        list.innerHTML = '<li class="empty-state">No goals set yet. Set your first goal above!</li>';
        return;
      }

      list.innerHTML = goals.map(goal => {
        // Calculate progress as a percentage (cap at 100%)
        const progress = goal.target_value > 0
          ? Math.min(100, Math.round((goal.current_value / goal.target_value) * 100))
          : 0;

        // Decide what CSS class to add — 'met', 'overdue', or neither
        const statusClass = goal.is_met    ? 'met'
                          : goal.is_overdue ? 'overdue'
                          : '';

        const statusText = goal.is_met    ? ' ✓ Met!'
                         : goal.is_overdue ? ' ⚠ Overdue'
                         : '';

        return `
          <li class="goal-item ${statusClass}">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <strong>${goal.goal_type.replace(/_/g, ' ')}</strong>
              <span class="activity-tag">${statusText || `${progress}%`}</span>
            </div>
            ${goal.description ? `<p style="color:var(--text-secondary); font-size:0.9rem;">${goal.description}</p>` : ''}
            <p style="color:var(--text-muted); font-size:0.85rem;">
              Target: ${goal.target_value} · Deadline: ${new Date(goal.target_date).toLocaleDateString('en-GB')}
            </p>
            <div class="progress-bar" aria-label="${progress}% complete">
              <div class="progress-fill" style="width: ${progress}%"></div>
            </div>
          </li>`;
      }).join('');

    } catch (error) {
      console.error('Goals load error:', error.message);
    }
  }


  // ============================================================
  // SECTION: Stats
  // ============================================================

  /**
   * loadStats — fetches the 7-day summaries for exercise and diet
   * and fills in the statistics section with goal progress and visual charts.
   */
  async function loadStats() {
    const loadingNote = document.getElementById('stats-loading');
    const progressContainer = document.getElementById('goal-progress-container');
    loadingNote.textContent = 'Loading your stats...';

    try {
      // Fetch exercise, diet, and goals data
      const [exRes, dietRes, goalsRes] = await Promise.all([
        fetch('/api/exercise/weekly-summary'),
        fetch('/api/diet/weekly-summary'),
        fetch('/api/goals/list')
      ]);

      const exData   = await exRes.json();
      const dietData = await dietRes.json();
      const goalsData = await goalsRes.json();

      // Update gauge values
      const calBurned = exData.summary.total_calories_burned || 0;
      const sessions = exData.summary.total_sessions || 0;
      const calConsumed = dietData.summary.total_calories_week || 0;
      const minutes = exData.summary.total_minutes || 0;

      document.getElementById('gauge-cal-burned').textContent = Math.round(calBurned);
      document.getElementById('gauge-sessions').textContent = sessions;
      document.getElementById('gauge-cal-consumed').textContent = Math.round(calConsumed);
      document.getElementById('gauge-minutes').textContent = Math.round(minutes);

      // Render visual charts
      renderCaloriesBurnedGauge(calBurned, 2500); // Default target 2500 kcal
      renderSessionsGauge(sessions, 4); // Default target 4 sessions
      renderCaloriesConsumedGauge(calConsumed, 14000); // Default target 14k kcal per week
      renderWorkoutTimeGauge(minutes, 150); // Default target 150 mins per week
      renderWeeklyActivityChart(exData.summary, dietData.summary);

      // Calculate and display goal progress
      displayGoalProgress(goalsData.goals, exData.summary, dietData.summary);

      loadingNote.textContent = 'Stats updated for the past 7 days.';

    } catch (error) {
      console.error('Stats load error:', error.message);
      loadingNote.textContent = 'Could not load stats. Please try again.';
    }
  }

  /**
   * renderCaloriesBurnedGauge — renders a doughnut chart for calories burned
   */
  function renderCaloriesBurnedGauge(current, target) {
    const ctx = document.getElementById('chart-calories-burned');
    if (!ctx) return;

    const percentage = Math.min((current / target) * 100, 100);

    new Chart(ctx, {
      type: 'doughnut',
      data: {
        datasets: [
          {
            data: [percentage, 100 - percentage],
            backgroundColor: ['#c8ff00', '#333333'],
            borderColor: ['#c8ff00', '#333333'],
            borderWidth: 0,
            cutout: '75%'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { display: false }
        }
      }
    });
  }

  /**
   * renderSessionsGauge — renders a doughnut chart for workout sessions
   */
  function renderSessionsGauge(current, target) {
    const ctx = document.getElementById('chart-sessions');
    if (!ctx) return;

    const percentage = Math.min((current / target) * 100, 100);

    new Chart(ctx, {
      type: 'doughnut',
      data: {
        datasets: [
          {
            data: [percentage, 100 - percentage],
            backgroundColor: ['#4caf50', '#333333'],
            borderColor: ['#4caf50', '#333333'],
            borderWidth: 0,
            cutout: '75%'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { display: false }
        }
      }
    });
  }

  /**
   * renderCaloriesConsumedGauge — renders a doughnut chart for calories consumed
   */
  function renderCaloriesConsumedGauge(current, target) {
    const ctx = document.getElementById('chart-calories-consumed');
    if (!ctx) return;

    const percentage = Math.min((current / target) * 100, 100);

    new Chart(ctx, {
      type: 'doughnut',
      data: {
        datasets: [
          {
            data: [percentage, 100 - percentage],
            backgroundColor: ['#ff9800', '#333333'],
            borderColor: ['#ff9800', '#333333'],
            borderWidth: 0,
            cutout: '75%'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { display: false }
        }
      }
    });
  }

  /**
   * renderWorkoutTimeGauge — renders a doughnut chart for workout time
   */
  function renderWorkoutTimeGauge(current, target) {
    const ctx = document.getElementById('chart-workout-time');
    if (!ctx) return;

    const percentage = Math.min((current / target) * 100, 100);

    new Chart(ctx, {
      type: 'doughnut',
      data: {
        datasets: [
          {
            data: [percentage, 100 - percentage],
            backgroundColor: ['#f44336', '#333333'],
            borderColor: ['#f44336', '#333333'],
            borderWidth: 0,
            cutout: '75%'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { display: false }
        }
      }
    });
  }

  /**
   * renderWeeklyActivityChart — renders a bar chart showing daily activity for the week
   */
  function renderWeeklyActivityChart(exerciseSummary, dietSummary) {
    const ctx = document.getElementById('chart-weekly-activity');
    if (!ctx) return;

    // Sample data — in production this would come from the API
    const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dailyCalories = [400, 550, 600, 480, 720, 650, 500]; // Sample data

    new Chart(ctx, {
      type: 'bar',
      data: {
        labels: daysOfWeek,
        datasets: [
          {
            label: 'Calories Burned',
            data: dailyCalories,
            backgroundColor: '#c8ff00',
            borderColor: '#9fc800',
            borderWidth: 1,
            borderRadius: 4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            labels: {
              color: '#f0f0f0',
              font: { size: 12 }
            }
          }
        },
        scales: {
          x: {
            grid: { color: '#333333' },
            ticks: { color: '#a0a0a0' }
          },
          y: {
            grid: { color: '#333333' },
            ticks: { color: '#a0a0a0' }
          }
        }
      }
    });
  }

  /**
   * displayGoalProgress — shows visual progress bars for active goals
   * based on current weekly activity.
   */
  function displayGoalProgress(goals, exerciseSummary, dietSummary) {
    const container = document.getElementById('goal-progress-container');

    if (!goals || goals.length === 0) {
      container.innerHTML = '<p class="empty-state">No active goals to track progress against.</p>';
      return;
    }

    const activeGoals = goals.filter(goal => goal.status === 'active');
    if (activeGoals.length === 0) {
      container.innerHTML = '<p class="empty-state">No active goals to track progress against.</p>';
      return;
    }

    container.innerHTML = activeGoals.map(goal => {
      const progress = calculateGoalProgress(goal, exerciseSummary, dietSummary);
      const percentage = Math.min(progress.percentage, 100);
      const statusText = progress.current >= goal.target_value ?
        'Goal achieved this week!' : `${progress.current} / ${goal.target_value} ${goal.unit}`;

      return `
        <div class="goal-progress-item">
          <div class="goal-progress-header">
            <div class="goal-progress-title">${goal.description || getGoalTypeLabel(goal.goal_type)}</div>
            <div class="goal-progress-value">${Math.round(percentage)}%</div>
          </div>
          <div class="goal-progress-bar">
            <div class="goal-progress-fill ${goal.goal_type}" style="width: ${percentage}%"></div>
          </div>
          <div class="goal-progress-text">${statusText}</div>
        </div>
      `;
    }).join('');
  }

  /**
   * calculateGoalProgress — calculates progress percentage for a goal
   * based on weekly activity data.
   */
  function calculateGoalProgress(goal, exerciseSummary, dietSummary) {
    let current = 0;
    let unit = '';

    switch (goal.goal_type) {
      case 'calories_burned':
        current = exerciseSummary.total_calories_burned || 0;
        unit = 'kcal';
        break;
      case 'workout_sessions':
        current = exerciseSummary.total_sessions || 0;
        unit = 'sessions';
        break;
      case 'run_distance':
        // This would need to be calculated from exercise entries with activity_type = 'running'
        // For now, we'll show 0 as we don't have this data in the summary
        current = 0;
        unit = 'km';
        break;
      case 'weight':
      case 'steps':
        // These would require additional data tracking
        current = 0;
        unit = goal.goal_type === 'weight' ? 'kg' : 'steps';
        break;
      default:
        current = 0;
        unit = '';
    }

    const percentage = goal.target_value > 0 ? (current / goal.target_value) * 100 : 0;

    return { current, percentage, unit };
  }

  /**
   * getGoalTypeLabel — returns a human-readable label for goal types.
   */
  function getGoalTypeLabel(goalType) {
    const labels = {
      'weight': 'Target Weight',
      'run_distance': 'Running Distance',
      'calories_burned': 'Weekly Calories Burned',
      'steps': 'Daily Steps',
      'workout_sessions': 'Weekly Workouts'
    };
    return labels[goalType] || goalType;
  }


  // ============================================================
  // SECTION: Groups
  // ============================================================

  /**
   * setupGroupForms — wires up the create group and join group forms.
   */
  function setupGroupForms() {
    // ── Create group form ──────────────────────────────────
    const createForm = document.getElementById('create-group-form');
    const createMsg  = document.getElementById('create-group-message');
    const inviteBox  = document.getElementById('invite-code-display');

    createForm.addEventListener('submit', async (event) => {
      event.preventDefault();

      const formData = new FormData(createForm);
      const name     = formData.get('name').trim();

      if (!name) {
        showMessage(createMsg, 'Please enter a group name.', 'error');
        return;
      }

      try {
        const response = await fetch('/api/groups/create', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ name })
        });

        const data = await response.json();

        if (response.ok) {
          showMessage(createMsg, `"${data.group.name}" created!`, 'success');
          createForm.reset();

          // Show the invite code so the user can share it
          inviteBox.hidden = false;
          inviteBox.innerHTML = `
            Share this invite code with your group:
            <strong>${data.invite_code}</strong>
          `;

          loadGroups(); // Refresh the groups list
        } else {
          showMessage(createMsg, data.error || 'Failed to create group.', 'error');
        }

      } catch (error) {
        console.error('Create group error:', error.message);
        showMessage(createMsg, 'Network error. Please try again.', 'error');
      }
    });

    // ── Join group form ─────────────────────────────────────
    const joinForm = document.getElementById('join-group-form');
    const joinMsg  = document.getElementById('join-group-message');

    joinForm.addEventListener('submit', async (event) => {
      event.preventDefault();

      const formData    = new FormData(joinForm);
      const invite_code = formData.get('invite_code').trim();

      if (!invite_code) {
        showMessage(joinMsg, 'Please enter an invite code.', 'error');
        return;
      }

      try {
        const response = await fetch('/api/groups/join', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ invite_code })
        });

        const data = await response.json();

        if (response.ok) {
          showMessage(joinMsg, data.message, 'success');
          joinForm.reset();
          loadGroups();
        } else {
          showMessage(joinMsg, data.error || 'Failed to join group.', 'error');
        }

      } catch (error) {
        console.error('Join group error:', error.message);
        showMessage(joinMsg, 'Network error. Please try again.', 'error');
      }
    });
  }

  /**
   * loadGroups — fetches the user's groups and renders them in a list.
   * Each group has a "Leave" button that sends a DELETE request.
   */
  async function loadGroups() {
    try {
      const response = await fetch('/api/groups/list');
      const data     = await response.json();

      const list   = document.getElementById('groups-list');
      const groups = data.groups || [];

      if (groups.length === 0) {
        list.innerHTML = '<li class="empty-state">You haven\'t joined any groups yet.</li>';
        return;
      }

      list.innerHTML = groups.map(group => `
        <li class="goal-item">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <strong>${group.name}</strong>
            <span class="activity-tag">${group.member_count} member${group.member_count !== 1 ? 's' : ''}</span>
          </div>
          <p style="color:var(--text-muted); font-size:0.85rem;">
            Invite code: <strong style="font-family:var(--font-mono); color:var(--accent)">${group.invite_code}</strong>
          </p>
          <button
            class="btn btn-outline btn-sm"
            onclick="leaveGroup(${group.id})"
            style="align-self:flex-start; margin-top:4px;"
          >
            Leave group
          </button>
        </li>`
      ).join('');

    } catch (error) {
      console.error('Groups load error:', error.message);
    }
  }

  /**
   * leaveGroup — sends a request to leave a group.
   * Called from the inline onclick on the "Leave group" buttons.
   * We attach this to window so the inline onclick can find it.
   *
   * @param {number} groupId - The ID of the group to leave
   */
  window.leaveGroup = async function(groupId) {
    if (!confirm('Are you sure you want to leave this group?')) return;

    try {
      const response = await fetch(`/api/groups/${groupId}/leave`, {
        method: 'DELETE'
      });

      if (response.ok) {
        loadGroups(); // Refresh the list after leaving
      }
    } catch (error) {
      console.error('Leave group error:', error.message);
    }
  };


  // ============================================================
  // SECTION: Logout
  // ============================================================

  /**
   * handleLogout — sends a logout request to the server.
   * The server destroys the session, then we redirect to login.
   */
  async function handleLogout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      // Whether logout succeeded or failed, redirect to login
      // (If the server is down, the session will expire on its own anyway)
      window.location.href = '/';
    }
  }


  // ============================================================
  // HELPER FUNCTIONS (shared utilities used across the page)
  // ============================================================

  /**
   * showMessage — displays a coloured message in a form.
   * @param {HTMLElement} el   - The element to write into
   * @param {string}      msg  - The message text
   * @param {string}      type - 'success' (green) or 'error' (red)
   */
  function showMessage(el, msg, type) {
    el.textContent = msg;
    el.className   = `form-message ${type}`;
  }

  /**
   * clearMessage — removes any message from an element.
   * @param {HTMLElement} el - The element to clear
   */
  function clearMessage(el) {
    el.textContent = '';
    el.className   = 'form-message';
  }

  /**
   * setLoading — disables or re-enables a button while a request is running.
   * @param {HTMLButtonElement} btn       - The button to toggle
   * @param {boolean}           loading   - true to disable, false to enable
   * @param {string}            label     - The button text to show
   */
  function setLoading(btn, loading, label) {
    btn.disabled    = loading;
    btn.textContent = label;
  }

  // ============================================================
  // EDIT MODALS — Exercise and Meal Entry Editing
  // ============================================================

  /**
   * openEditExerciseModal — opens the modal to edit an exercise entry
   */
  async function openEditExerciseModal(entryId) {
    try {
      // Fetch the entry data
      const response = await fetch(`/api/exercise/history?limit=100`);
      const data = await response.json();
      const entry = data.entries.find(e => e.id == entryId);

      if (!entry) {
        alert('Entry not found.');
        return;
      }

      // Populate the form with entry data
      document.getElementById('edit-ex-id').value = entry.id;
      document.getElementById('edit-ex-type').value = entry.activity_type;
      document.getElementById('edit-ex-name').value = entry.activity_name;
      document.getElementById('edit-ex-duration').value = entry.duration_mins || '';
      document.getElementById('edit-ex-distance').value = entry.distance_km || '';
      document.getElementById('edit-ex-sets').value = entry.sets || '';
      document.getElementById('edit-ex-reps').value = entry.reps || '';
      document.getElementById('edit-ex-weight').value = entry.weight_kg_used || '';
      document.getElementById('edit-ex-calories').value = entry.calories_burned || '';

      // Show/hide cardio vs strength fields
      const isCardio = entry.exercise_category === 'cardio';
      document.getElementById('edit-cardio-fields').hidden = !isCardio;
      document.getElementById('edit-strength-fields').hidden = isCardio;

      // Open the modal
      document.getElementById('edit-exercise-modal').showModal();

    } catch (error) {
      console.error('Error opening edit modal:', error.message);
      alert('Could not load entry data.');
    }
  }

  /**
   * openEditMealModal — opens the modal to edit a meal entry
   */
  async function openEditMealModal(entryId) {
    try {
      // Fetch the entry data
      const response = await fetch(`/api/diet/today`);
      const data = await response.json();
      let entry = data.entries.find(e => e.id == entryId);

      // If not found in today's entries, try diet history
      if (!entry) {
        const allResponse = await fetch(`/api/diet/history?limit=100`);
        const allData = await allResponse.json();
        entry = allData.entries.find(e => e.id == entryId);
      }

      if (!entry) {
        alert('Entry not found.');
        return;
      }

      // Populate the form with entry data
      document.getElementById('edit-meal-id').value = entry.id;
      document.getElementById('edit-meal-food-name').value = entry.food_name;
      document.getElementById('edit-meal-type').value = entry.meal_type;
      document.getElementById('edit-meal-calories').value = entry.calories;
      document.getElementById('edit-meal-quantity').value = entry.quantity || 1;

      // Open the modal
      document.getElementById('edit-meal-modal').showModal();

    } catch (error) {
      console.error('Error opening edit modal:', error.message);
      alert('Could not load entry data.');
    }
  }

  // ============================================================
  // MODAL EVENT LISTENERS
  // ============================================================

  // Wire up the edit exercise modal
  const editExerciseModal = document.getElementById('edit-exercise-modal');
  const editExerciseForm = document.getElementById('edit-exercise-form');
  const editExerciseMsg = document.getElementById('edit-exercise-message');

  if (editExerciseForm) {
    editExerciseForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const entryId = document.getElementById('edit-ex-id').value;
      const isCardio = !document.getElementById('edit-cardio-fields').hidden;

      const formData = {
        activity_type: document.getElementById('edit-ex-type').value,
        activity_name: document.getElementById('edit-ex-name').value,
        exercise_category: isCardio ? 'cardio' : 'strength',
        duration_mins: isCardio ? (Number(document.getElementById('edit-ex-duration').value) || null) : null,
        distance_km: isCardio ? (Number(document.getElementById('edit-ex-distance').value) || null) : null,
        sets: !isCardio ? (Number(document.getElementById('edit-ex-sets').value) || null) : null,
        reps: !isCardio ? (Number(document.getElementById('edit-ex-reps').value) || null) : null,
        weight_kg_used: !isCardio ? (Number(document.getElementById('edit-ex-weight').value) || null) : null,
        calories_burned: Number(document.getElementById('edit-ex-calories').value)
      };

      try {
        const response = await fetch(`/api/exercise/${entryId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        });

        if (response.ok) {
          showMessage(editExerciseMsg, 'Exercise entry updated!', 'success');
          setTimeout(() => {
            editExerciseModal.close();
            loadTodaysOverview(); // Refresh the display
          }, 500);
        } else {
          const error = await response.json();
          showMessage(editExerciseMsg, error.error || 'Update failed', 'error');
        }
      } catch (error) {
        console.error('Update error:', error);
        showMessage(editExerciseMsg, 'Network error', 'error');
      }
    });

    document.getElementById('edit-ex-close').addEventListener('click', () => {
      editExerciseModal.close();
    });

    document.getElementById('edit-ex-delete').addEventListener('click', async () => {
      if (!confirm('Are you sure you want to delete this entry?')) return;

      const entryId = document.getElementById('edit-ex-id').value;

      try {
        const response = await fetch(`/api/exercise/${entryId}`, {
          method: 'DELETE'
        });

        if (response.ok) {
          showMessage(editExerciseMsg, 'Entry deleted!', 'success');
          setTimeout(() => {
            editExerciseModal.close();
            loadTodaysOverview();
          }, 500);
        } else {
          const error = await response.json();
          showMessage(editExerciseMsg, error.error || 'Delete failed', 'error');
        }
      } catch (error) {
        console.error('Delete error:', error);
        showMessage(editExerciseMsg, 'Network error', 'error');
      }
    });

    // Toggle cardio/strength fields based on selected category
    document.getElementById('edit-ex-type').addEventListener('change', (e) => {
      const isCardio = ['Running', 'Cycling', 'Swimming', 'Walking', 'HIIT', 'Rowing'].includes(e.target.value);
      document.getElementById('edit-cardio-fields').hidden = !isCardio;
      document.getElementById('edit-strength-fields').hidden = isCardio;
    });
  }

  // Wire up the edit meal modal
  const editMealModal = document.getElementById('edit-meal-modal');
  const editMealForm = document.getElementById('edit-meal-form');
  const editMealMsg = document.getElementById('edit-meal-message');

  if (editMealForm) {
    editMealForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const entryId = document.getElementById('edit-meal-id').value;
      const formData = {
        food_name: document.getElementById('edit-meal-food-name').value,
        meal_type: document.getElementById('edit-meal-type').value,
        calories: Number(document.getElementById('edit-meal-calories').value),
        quantity: Number(document.getElementById('edit-meal-quantity').value) || 1
      };

      try {
        const response = await fetch(`/api/diet/${entryId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        });

        if (response.ok) {
          showMessage(editMealMsg, 'Meal entry updated!', 'success');
          setTimeout(() => {
            editMealModal.close();
            loadTodaysOverview();
          }, 500);
        } else {
          const error = await response.json();
          showMessage(editMealMsg, error.error || 'Update failed', 'error');
        }
      } catch (error) {
        console.error('Update error:', error);
        showMessage(editMealMsg, 'Network error', 'error');
      }
    });

    document.getElementById('edit-meal-close').addEventListener('click', () => {
      editMealModal.close();
    });

    document.getElementById('edit-meal-delete').addEventListener('click', async () => {
      if (!confirm('Are you sure you want to delete this entry?')) return;

      const entryId = document.getElementById('edit-meal-id').value;

      try {
        const response = await fetch(`/api/diet/${entryId}`, {
          method: 'DELETE'
        });

        if (response.ok) {
          showMessage(editMealMsg, 'Entry deleted!', 'success');
          setTimeout(() => {
            editMealModal.close();
            loadTodaysOverview();
          }, 500);
        } else {
          const error = await response.json();
          showMessage(editMealMsg, error.error || 'Delete failed', 'error');
        }
      } catch (error) {
        console.error('Delete error:', error);
        showMessage(editMealMsg, 'Network error', 'error');
      }
    });
  }

}); // End of DOMContentLoaded
