const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { User } = require('../models');
const authConfig = require('../config/auth');
const { badRequest, notFound } = require('./httpError');
const { isNonEmptyString, parseId } = require('./validation');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 6;

const bcryptRounds = () => Number(process.env.BCRYPT_ROUNDS) || 10;
const normalizeEmail = (email) => email.trim().toLowerCase();

const serialize = (user) => ({
  id: user.id,
  firstname: user.firstname,
  surname: user.surname,
  email: user.email,
});

async function findOrFail(id) {
  const userId = parseId(id);
  if (!userId) throw notFound('user not found');
  const user = await User.findByPk(userId);
  if (!user) throw notFound('user not found');
  return user;
}

function assertValidEmail(email) {
  if (!isNonEmptyString(email) || !EMAIL_REGEX.test(email.trim())) {
    throw badRequest('email is invalid');
  }
}

async function getById(id) {
  return serialize(await findOrFail(id));
}

async function create(body) {
  const { firstname, surname, email, password, confirmPassword } = body;

  if (!isNonEmptyString(firstname)) throw badRequest('firstname is required');
  if (!isNonEmptyString(surname)) throw badRequest('surname is required');
  assertValidEmail(email);
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    throw badRequest(`password must have at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  if (password !== confirmPassword) {
    throw badRequest('password and confirmPassword do not match');
  }

  const normalizedEmail = normalizeEmail(email);
  const existing = await User.findOne({ where: { email: normalizedEmail } });
  if (existing) throw badRequest('email is already registered');

  const user = await User.create({
    firstname: firstname.trim(),
    surname: surname.trim(),
    email: normalizedEmail,
    password: await bcrypt.hash(password, bcryptRounds()),
  });

  return serialize(user);
}

async function update(id, body) {
  const user = await findOrFail(id);
  const data = {};

  for (const field of ['firstname', 'surname']) {
    if (body[field] === undefined) continue;
    if (!isNonEmptyString(body[field])) throw badRequest(`${field} must be a non-empty string`);
    data[field] = body[field].trim();
  }

  if (body.email !== undefined) {
    assertValidEmail(body.email);
    const normalizedEmail = normalizeEmail(body.email);
    const existing = await User.findOne({ where: { email: normalizedEmail } });
    if (existing && existing.id !== user.id) {
      throw badRequest('email is already registered');
    }
    data.email = normalizedEmail;
  }

  if (!Object.keys(data).length) throw badRequest('no valid fields to update');

  await user.update(data);
}

async function remove(id) {
  const user = await findOrFail(id);
  await user.destroy();
}

async function generateToken(body) {
  const { email, password } = body;

  if (!isNonEmptyString(email) || typeof password !== 'string' || !password) {
    throw badRequest('email and password are required');
  }

  const user = await User.findOne({ where: { email: normalizeEmail(email) } });
  const validPassword = user && (await bcrypt.compare(password, user.password));
  if (!validPassword) throw badRequest('invalid email or password');

  if (!authConfig.secret) throw new Error('JWT_SECRET is not defined');

  const token = jwt.sign({ id: user.id, email: user.email }, authConfig.secret, {
    expiresIn: authConfig.expiresIn,
  });

  return { token };
}

module.exports = { getById, create, update, remove, generateToken };
