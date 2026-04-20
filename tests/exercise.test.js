// ============================================================
// exercise.test.js — Automated Tests for Exercise Routes
// ============================================================
// Tests POST /api/exercise/log and GET /api/exercise/history
// Also verifies that unauthenticated requests are rejected.
// ============================================================

const request = require('supertest');
const app     = require('../server/index');
const db      = require('../server/db');

let agent; // 'agent' keeps cookies (session) between requests — like a logged-in browser

// Before all tests: register + log in to get a session
beforeAll(async () => {
  agent = request.agent(app); // request.agent() persists the session cookie

  await agent.post('/api/auth/register').send({
    username: 'extest', real_name: 'Exercise Tester', email: 'extest@test-exercise.com', password: 'pass1234'
  });
});

// After all tests: clean up
afterAll(async () => {
  await db.query("DELETE FROM users WHERE email = 'extest@test-exercise.com'");
  await db.end();
});

describe('POST /api/exercise/log', () => {

  test('logs a cardio exercise — expects 201', async () => {
    const response = await agent.post('/api/exercise/log').send({
      activity_type:     'Running',
      activity_name:     'Morning run',
      exercise_category: 'cardio',
      duration_mins:     30,
      distance_km:       5.0,
      calories_burned:   300
    });

    expect(response.status).toBe(201);
    expect(response.body.entry.activity_name).toBe('Morning run');
    expect(response.body.entry.exercise_category).toBe('cardio');
  });

  test('logs a strength exercise with sets, reps and weight — expects 201', async () => {
    const response = await agent.post('/api/exercise/log').send({
      activity_type:     'Bench Press',
      activity_name:     'Flat bench press',
      exercise_category: 'strength',
      sets:              3,
      reps:              10,
      weight_kg_used:    80,
      calories_burned:   150
    });

    expect(response.status).toBe(201);
    expect(response.body.entry.sets).toBe(3);
    expect(response.body.entry.reps).toBe(10);
    expect(response.body.entry.weight_kg_used).toBe('80.00'); // PostgreSQL returns NUMERIC as string
  });

  test('returns 400 when required fields are missing', async () => {
    const response = await agent.post('/api/exercise/log').send({
      activity_name: 'No type or category'
      // Missing: activity_type, exercise_category
    });
    expect(response.status).toBe(400);
  });

  test('returns 401 when not logged in', async () => {
    // Use request(app) directly — no session cookie
    const response = await request(app).post('/api/exercise/log').send({
      activity_type: 'Running', activity_name: 'Test', exercise_category: 'cardio'
    });
    expect(response.status).toBe(401);
  });
});

describe('GET /api/exercise/history', () => {

  test('returns a list of entries for the logged-in user', async () => {
    const response = await agent.get('/api/exercise/history');
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.entries)).toBe(true);
  });

  test('returns 401 when not logged in', async () => {
    const response = await request(app).get('/api/exercise/history');
    expect(response.status).toBe(401);
  });
});
