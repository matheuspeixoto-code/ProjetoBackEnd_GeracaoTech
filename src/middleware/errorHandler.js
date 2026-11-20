const { HttpError } = require('../services/httpError');

function notFoundHandler(req, res) {
  res.status(404).json({ message: 'route not found' });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ message: err.message });
  }

  // JSON malformado
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'invalid JSON body' });
  }

  // Payload maior que o limite configurado no express.json()
  if (err.type === 'entity.too.large') {
    return res.status(400).json({ message: 'payload too large' });
  }

  // Violações de validação/unicidade do Sequelize
  if (
    err.name === 'SequelizeValidationError' ||
    err.name === 'SequelizeUniqueConstraintError'
  ) {
    return res.status(400).json({ message: err.errors?.[0]?.message || err.message });
  }

  console.error(err);
  return res.status(500).json({ message: 'internal server error' });
}

module.exports = { notFoundHandler, errorHandler };
