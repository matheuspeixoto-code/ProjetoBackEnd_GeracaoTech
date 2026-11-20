require('dotenv').config();
const express = require('express');
const qs = require('qs');
const routes = require('./routes');
const imageService = require('./services/imageService');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

const app = express();

// O Express 5 usa o parser "simple" por padrão, que não entende option[45]=GG,PP.
// Com parseArrays: false, option[1]=x vira { option: { 1: 'x' } } (e não um array).
app.set('query parser', (str) => qs.parse(str, { parseArrays: false }));

// Limite alto porque as imagens dos produtos chegam em base64 no JSON.
app.use(express.json({ limit: '50mb' }));

// Imagens salvas pelo servidor
app.use('/media', express.static(imageService.MEDIA_DIR));

app.use('/v1', routes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
