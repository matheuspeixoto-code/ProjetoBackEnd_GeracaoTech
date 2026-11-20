require('dotenv').config();
const { Sequelize } = require('sequelize');

// `underscored: true` faz o Sequelize gerar as colunas created_at / updated_at
// (e demais colunas em snake_case) quando `timestamps: true`.
const define = { underscored: true, timestamps: true };

let sequelize;

const isTest = process.env.NODE_ENV === 'test';

if (isTest && !process.env.TEST_DB_NAME) {
  // Nos testes usamos SQLite em memória para não depender de um MySQL rodando.
  sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: ':memory:',
    logging: false,
    define,
  });
} else {
  // Para rodar os testes contra um MySQL real, defina TEST_DB_NAME com um banco
  // exclusivo de testes (as tabelas dele são recriadas a cada teste).
  sequelize = new Sequelize(
    isTest ? process.env.TEST_DB_NAME : process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASSWORD,
    {
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT) || 3306,
      dialect: 'mysql',
      logging: false,
      define,
    }
  );
}

module.exports = sequelize;
