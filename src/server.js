require('dotenv').config();
const app = require('./app');
const { sequelize } = require('./models');

const PORT = process.env.PORT || 3000;

async function start() {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not defined. Check your .env file.');
  }

  await sequelize.authenticate();
  // Cria as tabelas caso ainda não existam.
  await sequelize.sync();

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error('Failed to start the server:', err);
  process.exit(1);
});
