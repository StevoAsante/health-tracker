// ============================================================
// stats-app.js — Performance Dashboard Application
// ============================================================
// Complete stats page with time period switching, responsive
// KPI cards, goal gauges, and trend charts. Modular component
// architecture with clean state management.
// ============================================================

// ── STATE MANAGEMENT ────────────────────────────────────
// Centralized state that components reference and update
const StatsAppState = {
  selectedPeriod: 'week', // day, week, month, year, allTime
  stats: null,            // Current period stats
  goals: [],              // Active goals for current period
  chartDataWorkouts: [],  // Weekly workout trend data
  chartDataCalories: [], // Calories trend data
  isLoading: false,
  error: null
};

// ── INITIALIZATION ──────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  console.log('Stats app initializing...');
  initStatsApp();
});

async function initStatsApp() {
  try {
    // Load initial data for default period (week)
    await switchPeriod('week');
    setupPeriodButtons();
    console.log('Stats app ready');
  } catch (error) {
    console.error('Stats app init error:', error);
    setError('Failed to load stats. Please refresh the page.');
  }
}

// ── PERIOD SWITCHING ────────────────────────────────────
function setupPeriodButtons() {
  // Find all period toggle buttons
  const buttons = document.querySelectorAll('[data-period-btn]');
  buttons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const period = e.target.dataset.periodBtn;
      switchPeriod(period);
    });
  });
}

// Handle period change: fetch new data and re-render all sections
async function switchPeriod(period) {
  if (!['day', 'week', 'month', 'year', 'allTime'].includes(period)) {
    console.warn(`Invalid period: ${period}`);
    return;
  }

  StatsAppState.selectedPeriod = period;
  StatsAppState.isLoading = true;
  setLoadingUI(true);

  try {
    // Fetch all data in parallel for the selected period
    const [statsRes, goalsRes, workoutsChartRes, caloriesChartRes] = await Promise.all([
      fetch(`/api/stats/summary/${period}`),
      fetch(`/api/stats/goals/${period}`),
      fetch(`/api/stats/chart/workouts/${period}`),
      fetch(`/api/stats/chart/calories/${period}`)
    ]);

    if (!statsRes.ok || !goalsRes.ok) {
      throw new Error(`Server error: ${statsRes.status || goalsRes.status}`);
    }

    // Parse responses
    const statsData = await statsRes.json();
    const goalsData = await goalsRes.json();
    const workoutsChartData = workoutsChartRes.ok ? await workoutsChartRes.json() : null;
    const caloriesChartData = caloriesChartRes.ok ? await caloriesChartRes.json() : null;

    // Update state
    StatsAppState.stats = statsData.stats;
    StatsAppState.goals = goalsData.goals || [];
    StatsAppState.chartDataWorkouts = workoutsChartData?.chartData || [];
    StatsAppState.chartDataCalories = caloriesChartData?.chartData || [];
    StatsAppState.error = null;

    // Update UI for all sections
    updatePeriodButtons(period);
    renderKpiCards();
    renderGoalsSection();
    renderTrendsCharts();

  } catch (error) {
    console.error(`Error loading ${period} stats:`, error);
    setError(`Could not load stats for this period. Please try again.`);
  } finally {
    StatsAppState.isLoading = false;
    setLoadingUI(false);
  }
}

// ── COMPONENT: KPI CARDS ────────────────────────────────
/**
 * renderKpiCards() — Renders responsive KPI cards at the top
 * showing high-level summary for the selected period.
 * Cards stack on mobile, grid on desktop.
 */
function renderKpiCards() {
  const container = document.getElementById('kpi-cards-container');
  if (!container || !StatsAppState.stats) return;

  const stats = StatsAppState.stats;
  
  // Format helper functions
  const formatMinutes = (mins) => {
    const hours = Math.floor(mins / 60);
    const remaining = mins % 60;
    return hours > 0 ? `${hours}h ${remaining}m` : `${remaining}m`;
  };

  // Build KPI card data (only show non-zero values)
  const kpiData = [
    {
      icon: '🏋️',
      title: 'Workouts',
      value: stats.workoutsCount,
      unit: 'sessions',
      show: true
    },
    {
      icon: '⏱️',
      title: 'Workout Time',
      value: formatMinutes(Math.round(stats.totalWorkoutMinutes)),
      unit: '',
      show: stats.totalWorkoutMinutes > 0
    },
    {
      icon: '🔥',
      title: 'Calories Burned',
      value: Math.round(stats.totalCaloriesBurned),
      unit: 'kcal',
      show: stats.totalCaloriesBurned > 0
    },
    {
      icon: '🍎',
      title: 'Calories Consumed',
      value: Math.round(stats.totalCaloriesConsumed),
      unit: 'kcal',
      show: stats.totalCaloriesConsumed > 0
    },
    {
      icon: '💪',
      title: 'Training Volume',
      value: Math.round(stats.volumeKg),
      unit: 'kg',
      show: stats.volumeKg > 0
    }
  ];

  const cardsHTML = kpiData
    .filter(k => k.show)
    .map(kpi => `
      <div class="kpi-card">
        <div class="kpi-icon">${kpi.icon}</div>
        <div class="kpi-content">
          <p class="kpi-title">${kpi.title}</p>
          <p class="kpi-value">${kpi.value} <span class="kpi-unit">${kpi.unit}</span></p>
        </div>
      </div>
    `).join('');

  container.innerHTML = cardsHTML || '<p class="empty-state">No data for this period yet.</p>';
}

// ── COMPONENT: GOALS SECTION ────────────────────────────
/**
 * renderGoalsSection() — Renders active goals with visual
 * gauges (circular progress bars) that reflect actual data.
 */
function renderGoalsSection() {
  const container = document.getElementById('goals-section-container');
  if (!container) return;

  const goals = StatsAppState.goals;

  if (!goals || goals.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>No active goals for this period.</p>
        <p class="hint">Go to the overview tab to create a goal!</p>
      </div>
    `;
    return;
  }

const goalsHTML = goals.map((goal, idx) => {
      const title = escapeHTML(goal.description || formatGoalType(goal.goal_type));
      const currentValue = Number(goal.current_value || 0);
      const targetValue = Number(goal.target_value || 0);

      return `
      <!-- Goal item with circular gauge -->
      <div class="goal-item">
        <div class="goal-header">
          <h4 class="goal-title">${title}</h4>
          <span class="goal-status ${goal.status === 'ACHIEVED' ? 'achieved' : 'in-progress'}">
            ${goal.status === 'ACHIEVED' ? '✓ Achieved' : 'In Progress'}
          </span>
        </div>

        <div class="goal-content">
          <!-- Circular gauge on the left -->
          <div class="goal-gauge">
            <svg class="gauge-circle" width="120" height="120" viewBox="0 0 120 120">
              <!-- Background circle -->
              <circle cx="60" cy="60" r="50" fill="none" stroke="#f0f0f0" stroke-width="8"/>
              <!-- Progress circle (animates) -->
              <circle 
                class="gauge-progress"
                cx="60" cy="60" r="50" 
                fill="none" 
                stroke="#c8ff00" 
                stroke-width="8"
                stroke-dasharray="${Math.PI * 100}"
                stroke-dashoffset="${Math.PI * 100 * (1 - goal.progressPercentage / 100)}"
                stroke-linecap="round"
                style="transform: rotate(-90deg); transform-origin: 60px 60px; transition: stroke-dashoffset 0.5s ease;"
              />
            </svg>
            <div class="gauge-text">
              <span class="gauge-percentage">${goal.progressPercentage}%</span>
            </div>
          </div>

          <!-- Goal details on the right -->
          <div class="goal-details">
            <p class="goal-progress">
              <strong>${currentValue}</strong> / ${targetValue} ${goal.unit}
            </p>
            <p class="goal-type">${formatGoalType(goal.goal_type)}</p>
            ${goal.target_date ? `
              <p class="goal-deadline">
                Due: ${formatDate(goal.target_date)}
              </p>
            ` : ''}
          </div>
        </div>
      </div>
    `;
    }).join('');

  container.innerHTML = goalsHTML;
}

// ── COMPONENT: TRENDS CHARTS ────────────────────────────
/**
 * renderTrendsCharts() — Renders line/bar charts for
 * workouts and calories trends over the period.
 */
function renderTrendsCharts() {
  renderWorkoutsTrendChart();
  renderCaloriesTrendChart();
}

/**
 * renderWorkoutsTrendChart — Bar chart of workouts per week
 */
function renderWorkoutsTrendChart() {
  const canvasEl = document.getElementById('chart-workouts-trend');
  if (!canvasEl || !StatsAppState.chartDataWorkouts || StatsAppState.chartDataWorkouts.length === 0) {
    // Hide chart if no data
    const container = canvasEl?.closest('.chart-container');
    if (container) container.style.display = 'none';
    return;
  }

  const container = canvasEl.closest('.chart-container');
  if (container) container.style.display = 'block';

  // Prepare chart data
  const labels = StatsAppState.chartDataWorkouts.map(d => {
    const date = new Date(d.periodStart);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  });

  const data = StatsAppState.chartDataWorkouts.map(d => d.workoutCount);

  // Destroy existing chart if any
  if (window.workoutsChart instanceof Chart) {
    window.workoutsChart.destroy();
  }

  const ctx = canvasEl.getContext('2d');
  window.workoutsChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Workouts per Week',
        data: data,
        backgroundColor: '#c8ff00',
        borderColor: '#9db300',
        borderWidth: 1,
        borderRadius: 4,
        hoverBackgroundColor: '#ffeb3b'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      indexAxis: undefined,
      plugins: {
        legend: {
          display: true,
          position: 'top'
        },
        title: {
          display: false
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            stepSize: 1
          }
        }
      }
    }
  });
}

/**
 * renderCaloriesTrendChart — Line chart of calories burned vs consumed
 */
function renderCaloriesTrendChart() {
  const canvasEl = document.getElementById('chart-calories-trend');
  if (!canvasEl || !StatsAppState.chartDataCalories || StatsAppState.chartDataCalories.length === 0) {
    // Hide chart if no data
    const container = canvasEl?.closest('.chart-container');
    if (container) container.style.display = 'none';
    return;
  }

  const container = canvasEl.closest('.chart-container');
  if (container) container.style.display = 'block';

  // Prepare chart data
  const labels = StatsAppState.chartDataCalories.map(d => {
    const date = new Date(d.periodStart);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  });

  const burnedData = StatsAppState.chartDataCalories.map(d => d.caloriesBurned);
  const consumedData = StatsAppState.chartDataCalories.map(d => d.caloriesConsumed);

  // Destroy existing chart if any
  if (window.caloriesChart instanceof Chart) {
    window.caloriesChart.destroy();
  }

  const ctx = canvasEl.getContext('2d');
  window.caloriesChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Calories Burned',
          data: burnedData,
          borderColor: '#ff6b6b',
          backgroundColor: 'rgba(255, 107, 107, 0.1)',
          borderWidth: 2,
          tension: 0.4,
          fill: true,
          pointRadius: 4,
          pointBackgroundColor: '#ff6b6b',
          pointBorderColor: '#fff',
          pointBorderWidth: 2
        },
        {
          label: 'Calories Consumed',
          data: consumedData,
          borderColor: '#4ecdc4',
          backgroundColor: 'rgba(78, 205, 196, 0.1)',
          borderWidth: 2,
          tension: 0.4,
          fill: true,
          pointRadius: 4,
          pointBackgroundColor: '#4ecdc4',
          pointBorderColor: '#fff',
          pointBorderWidth: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          display: true,
          position: 'top'
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: function(value) {
              return value.toLocaleString() + ' cal';
            }
          }
        }
      }
    }
  });
}

// ── UI HELPERS ──────────────────────────────────────────
function updatePeriodButtons(selectedPeriod) {
  const buttons = document.querySelectorAll('[data-period-btn]');
  buttons.forEach(btn => {
    if (btn.dataset.periodBtn === selectedPeriod) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

function setLoadingUI(isLoading) {
  const spinner = document.getElementById('stats-loading-spinner');
  if (spinner) {
    spinner.style.display = isLoading ? 'block' : 'none';
  }
}

function setError(message) {
  const errorEl = document.getElementById('stats-error-message');
  if (errorEl) {
    errorEl.textContent = message;
    errorEl.style.display = message ? 'block' : 'none';
  }
  StatsAppState.error = message;
}

// ── FORMATTING HELPERS ──────────────────────────────────
function formatGoalType(type) {
  const typeMap = {
    'calories_burned': 'Calories Burned',
    'workout_sessions': 'Workout Sessions',
    'run_distance': 'Running Distance',
    'weight': 'Target Weight',
    'steps': 'Daily Steps',
    'volume': 'Training Volume'
  };
  return typeMap[type] || type;
}

function formatDate(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function escapeHTML(text) {
  if (typeof text !== 'string') return '';
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

// Export for testing or external use
window.StatsApp = {
  switchPeriod,
  getState: () => StatsAppState
};
