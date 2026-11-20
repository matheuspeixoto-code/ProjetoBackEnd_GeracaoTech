const os = require('os');
const path = require('path');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';
process.env.JWT_EXPIRES_IN = '1h';
process.env.BCRYPT_ROUNDS = '4';
process.env.BASE_URL = 'http://localhost:3000';
// Cada worker grava as imagens em uma pasta temporária própria.
process.env.MEDIA_DIR = path.join(os.tmpdir(), `projeto-backend-media-${process.pid}`);
