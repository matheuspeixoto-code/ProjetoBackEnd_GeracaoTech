const jwt = require('jsonwebtoken');
const authConfig = require('../config/auth');
const { unauthorized } = require('../services/httpError');

// Valida o header "Authorization: Bearer <token>".
module.exports = (req, res, next) => {
  const [scheme, token] = (req.headers.authorization || '').split(' ');

  if (!/^Bearer$/i.test(scheme || '') || !token) {
    return next(unauthorized('authorization token is required'));
  }

  try {
    req.user = jwt.verify(token, authConfig.secret);
    return next();
  } catch (err) {
    return next(unauthorized('invalid or expired token'));
  }
};
