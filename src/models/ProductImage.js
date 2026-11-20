const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ProductImage = sequelize.define(
  'ProductImage',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    product_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'products', key: 'id' },
    },
    enabled: { type: DataTypes.BOOLEAN, defaultValue: false },
    // Caminho relativo da imagem dentro da pasta de mídia do servidor.
    path: { type: DataTypes.STRING, allowNull: false },
  },
  { tableName: 'product_images', timestamps: false }
);

module.exports = ProductImage;
