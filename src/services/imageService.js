const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { badRequest } = require('./httpError');

// Pasta onde as imagens são gravadas (servida em /media).
const MEDIA_DIR = path.resolve(
  process.env.MEDIA_DIR || path.join(process.cwd(), 'public', 'media')
);

const MIME_TO_EXT = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};
const ALLOWED_EXT = new Set(Object.values(MIME_TO_EXT));
const DATA_URI = /^data:([\w/+.-]+);base64,/i;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

const isUrl = (content) =>
  typeof content === 'string' && /^https?:\/\//i.test(content);

// Valida e decodifica uma imagem { type, content } sem tocar no disco.
function prepare(image, { fallbackExt } = {}) {
  if (!image || typeof image !== 'object') throw badRequest('invalid image');

  let { type, content } = image;
  if (typeof content !== 'string' || !content.trim()) {
    throw badRequest('image content (base64) is required');
  }

  let base64 = content.trim();
  const dataUri = DATA_URI.exec(base64);
  if (dataUri) {
    if (type === undefined) type = dataUri[1];
    base64 = base64.slice(dataUri[0].length);
  }
  base64 = base64.replace(/\s+/g, '');

  let ext;
  if (type !== undefined) {
    ext = MIME_TO_EXT[String(type).toLowerCase()];
    if (!ext) throw badRequest(`unsupported image type: ${type}`);
  } else if (fallbackExt && ALLOWED_EXT.has(fallbackExt)) {
    ext = fallbackExt;
  } else {
    throw badRequest('image type is required');
  }

  if (!base64 || !BASE64.test(base64)) {
    throw badRequest('image content must be a valid base64 string');
  }

  const buffer = Buffer.from(base64, 'base64');
  if (!buffer.length) throw badRequest('image content must be a valid base64 string');

  return { buffer, ext };
}

// Grava a imagem e devolve o caminho relativo (ex.: product-1/1700000-ab12.png).
async function save(productId, { buffer, ext }) {
  const relative = path.posix.join(
    `product-${productId}`,
    `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`
  );
  const absolute = path.join(MEDIA_DIR, relative);
  await fs.promises.mkdir(path.dirname(absolute), { recursive: true });
  await fs.promises.writeFile(absolute, buffer);
  return relative;
}

// Remove o arquivo do disco (ignora erros, ex.: arquivo já inexistente).
async function remove(relativePath) {
  if (!relativePath) return;
  const absolute = path.resolve(MEDIA_DIR, relativePath);
  if (!absolute.startsWith(MEDIA_DIR + path.sep)) return;
  try {
    await fs.promises.unlink(absolute);
  } catch (err) {
    // nada a fazer
  }
}

function toUrl(relativePath) {
  const base = (
    process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`
  ).replace(/\/+$/, '');
  return `${base}/media/${relativePath}`;
}

module.exports = { MEDIA_DIR, isUrl, prepare, save, remove, toUrl };
