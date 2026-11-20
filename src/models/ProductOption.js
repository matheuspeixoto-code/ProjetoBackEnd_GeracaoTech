const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ProductOption = sequelize.define(
  'ProductOption',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    product_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'products', key: 'id' },
    },
    title: { type: DataTypes.STRING, allowNull: false },
    shape: {
      type: DataTypes.ENUM('square', 'circle'),
      defaultValue: 'square',
    },
    // Valor do border-radius da opção.
    radius: { type: DataTypes.INTEGER, defaultValue: 0 },
    type: {
      type: DataTypes.ENUM('text', 'color'),
      defaultValue: 'text',
    },
    // Todas as opções do produto separadas por vírgula (ex.: "PP,M,GG").
    values: { type: DataTypes.STRING(1000), allowNull: false },
  },
  { tableName: 'product_options', timestamps: false }
);

module.exports = ProductOption;
