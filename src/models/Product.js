const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Product = sequelize.define(
  'Product',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    enabled: { type: DataTypes.BOOLEAN, defaultValue: false },
    name: { type: DataTypes.STRING, allowNull: false },
    slug: { type: DataTypes.STRING, allowNull: false },
    use_in_menu: { type: DataTypes.BOOLEAN, defaultValue: false },
    stock: { type: DataTypes.INTEGER, defaultValue: 0 },
    // STRING(1000) para comportar descrições maiores que os 255 caracteres padrão.
    description: { type: DataTypes.STRING(1000) },
    price: { type: DataTypes.FLOAT, allowNull: false },
    price_with_discount: { type: DataTypes.FLOAT, allowNull: false },
  },
  { tableName: 'products', timestamps: true }
);

module.exports = Product;
