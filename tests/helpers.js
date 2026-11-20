const request = require('supertest');
const app = require('../src/app');
const { sequelize } = require('../src/models');

// 1x1 px PNG válido, em base64
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

async function resetDatabase() {
  await sequelize.sync({ force: true });
}

async function createUserAndToken(overrides = {}) {
  const payload = {
    firstname: 'Maria',
    surname: 'Silva',
    email: 'maria@mail.com',
    password: '123@123',
    confirmPassword: '123@123',
    ...overrides,
  };

  const created = await request(app).post('/v1/user').send(payload);
  const tokenRes = await request(app)
    .post('/v1/user/token')
    .send({ email: payload.email, password: payload.password });

  return { user: created.body, token: tokenRes.body.token, payload };
}

const bearer = (token) => ({ Authorization: `Bearer ${token}` });

module.exports = { request, app, sequelize, PNG_BASE64, resetDatabase, createUserAndToken, bearer };
