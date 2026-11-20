require('dotenv').config();

// Getters para ler as variáveis de ambiente no momento do uso.
module.exports = {
  get secret() {
    return process.env.JWT_SECRET;
  },
  get expiresIn() {
    return process.env.JWT_EXPIRES_IN || '1h';
  },
};
