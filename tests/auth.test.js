// ============================================================
// auth.test.js — Automated Tests for Authentication Routes
// ============================================================
// Run tests with:  npm test
//
// Uses Jest (the test runner) + Supertest (makes fake HTTP
// requests to our app without starting a real server).
// ============================================================

const request = require('supertest');
const app     = require('../server/index');
const db      = require('../server/db');

// Clean up test users after all tests finish
afterAll(async () => {
  await db.query("DELETE FROM users WHERE email LIKE '%@test-auth.com'");
  await db.end();
});

describe('POST /api/auth/register', () => {

  test('creates account with valid data — expects 201', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send({
        username:  'testuser01',
        real_name: 'Test User One',
        email:     'testuser01@test-auth.com',
        password:  'password123',
        height_cm: 175,
        weight_kg: 70,
        age:       22
      });

    expect(response.status).toBe(201);
    expect(response.body.message).toContain('successfully');
    expect(response.body.user.email).toBe('testuser01@test-auth.com');
    // CRITICAL: we must never return the password in a response
    expect(response.body.user.password).toBeUndefined();
  });

  test('returns 400 when required fields are missing', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send({ username: 'incomplete', email: 'inc@test-auth.com' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBeDefined();
  });

  test('returns 400 for an invalid email format', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send({
        username: 'bademail', real_name: 'Bad', email: 'not-valid', password: 'pass123'
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/valid email/i);
  });

  test('returns 400 when password is under 6 characters', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send({
        username: 'shortpwd', real_name: 'Short', email: 'short@test-auth.com', password: '123'
      });

    expect(response.status).toBe(400);
  });

  test('returns 409 when username is already taken', async () => {
    await request(app).post('/api/auth/register').send({
      username: 'dupuser', real_name: 'Dup', email: 'dup1@test-auth.com', password: 'pass1234'
    });
    const response = await request(app).post('/api/auth/register').send({
      username: 'dupuser', real_name: 'Dup 2', email: 'dup2@test-auth.com', password: 'pass1234'
    });
    expect(response.status).toBe(409);
  });
});

describe('POST /api/auth/login', () => {

  beforeAll(async () => {
    await request(app).post('/api/auth/register').send({
      username: 'logintest', real_name: 'Login User', email: 'logintest@test-auth.com', password: 'correctpassword'
    });
  });

  test('logs in with correct credentials — expects 200', async () => {
    const response = await request(app).post('/api/auth/login').send({
      email: 'logintest@test-auth.com', password: 'correctpassword'
    });
    expect(response.status).toBe(200);
    expect(response.body.message).toContain('successful');
  });

  test('returns 401 with wrong password', async () => {
    const response = await request(app).post('/api/auth/login').send({
      email: 'logintest@test-auth.com', password: 'wrongpassword'
    });
    expect(response.status).toBe(401);
  });

  test('returns 401 for non-existent email', async () => {
    const response = await request(app).post('/api/auth/login').send({
      email: 'nobody@test-auth.com', password: 'whatever'
    });
    expect(response.status).toBe(401);
  });
});
