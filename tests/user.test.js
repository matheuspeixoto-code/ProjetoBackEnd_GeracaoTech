const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { request, app, sequelize, resetDatabase, createUserAndToken, bearer } = require('./helpers');
const { User } = require('../src/models');

const validUser = {
  firstname: 'João',
  surname: 'Souza',
  email: 'joao@mail.com',
  password: '123@123',
  confirmPassword: '123@123',
};

beforeEach(resetDatabase);
afterAll(() => sequelize.close());

describe('POST /v1/user', () => {
  it('cria o usuário (201) e não expõe a senha', async () => {
    const res = await request(app).post('/v1/user').send(validUser);

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(Number),
      firstname: 'João',
      surname: 'Souza',
      email: 'joao@mail.com',
    });
    expect(res.body.password).toBeUndefined();
  });

  it('armazena o hash bcrypt da senha, e não o texto puro', async () => {
    const res = await request(app).post('/v1/user').send(validUser);
    const saved = await User.findByPk(res.body.id);

    expect(saved.password).not.toBe('123@123');
    expect(await bcrypt.compare('123@123', saved.password)).toBe(true);
  });

  it('gera as colunas created_at e updated_at', async () => {
    const res = await request(app).post('/v1/user').send(validUser);
    const saved = await User.findByPk(res.body.id);

    expect(User.rawAttributes.createdAt.field).toBe('created_at');
    expect(User.rawAttributes.updatedAt.field).toBe('updated_at');
    expect(saved.createdAt).toBeInstanceOf(Date);
  });

  it.each([
    ['firstname ausente', { firstname: undefined }],
    ['surname ausente', { surname: undefined }],
    ['email ausente', { email: undefined }],
    ['email inválido', { email: 'nao-e-email' }],
    ['senha ausente', { password: undefined, confirmPassword: undefined }],
    ['senha curta', { password: '123', confirmPassword: '123' }],
    ['confirmPassword diferente', { confirmPassword: 'outra-senha' }],
  ])('retorna 400 com %s', async (_name, override) => {
    const res = await request(app)
      .post('/v1/user')
      .send({ ...validUser, ...override });

    expect(res.status).toBe(400);
  });

  it('retorna 400 com e-mail já cadastrado', async () => {
    await request(app).post('/v1/user').send(validUser);
    const res = await request(app).post('/v1/user').send(validUser);

    expect(res.status).toBe(400);
  });

  it('retorna 400 com JSON malformado', async () => {
    const res = await request(app)
      .post('/v1/user')
      .set('Content-Type', 'application/json')
      .send('{ invalido');

    expect(res.status).toBe(400);
  });
});

describe('GET /v1/user/:id', () => {
  it('retorna o usuário (200)', async () => {
    const created = await request(app).post('/v1/user').send(validUser);
    const res = await request(app).get(`/v1/user/${created.body.id}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: created.body.id,
      firstname: 'João',
      surname: 'Souza',
      email: 'joao@mail.com',
    });
  });

  it('retorna 404 quando não existe', async () => {
    const res = await request(app).get('/v1/user/999');
    expect(res.status).toBe(404);
  });

  it('retorna 404 quando o id é inválido', async () => {
    const res = await request(app).get('/v1/user/abc');
    expect(res.status).toBe(404);
  });
});

describe('POST /v1/user/token', () => {
  beforeEach(() => request(app).post('/v1/user').send(validUser));

  it('retorna o token JWT (200)', async () => {
    const res = await request(app)
      .post('/v1/user/token')
      .send({ email: 'joao@mail.com', password: '123@123' });

    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');

    const decoded = jwt.verify(res.body.token, process.env.JWT_SECRET);
    expect(decoded.email).toBe('joao@mail.com');
  });

  it('retorna 400 com senha incorreta', async () => {
    const res = await request(app)
      .post('/v1/user/token')
      .send({ email: 'joao@mail.com', password: 'errada' });

    expect(res.status).toBe(400);
  });

  it('retorna 400 com usuário inexistente', async () => {
    const res = await request(app)
      .post('/v1/user/token')
      .send({ email: 'ninguem@mail.com', password: '123@123' });

    expect(res.status).toBe(400);
  });

  it('retorna 400 sem email/senha', async () => {
    const res = await request(app).post('/v1/user/token').send({});
    expect(res.status).toBe(400);
  });
});

describe('PUT /v1/user/:id', () => {
  it('atualiza o usuário (204, sem corpo)', async () => {
    const { user, token } = await createUserAndToken();

    const res = await request(app)
      .put(`/v1/user/${user.id}`)
      .set(bearer(token))
      .send({ firstname: 'Ana', surname: 'Lima', email: 'ana@mail.com' });

    expect(res.status).toBe(204);
    expect(res.text).toBe('');

    const after = await request(app).get(`/v1/user/${user.id}`);
    expect(after.body).toMatchObject({ firstname: 'Ana', surname: 'Lima', email: 'ana@mail.com' });
  });

  it('retorna 401 sem token', async () => {
    const { user } = await createUserAndToken();
    const res = await request(app).put(`/v1/user/${user.id}`).send({ firstname: 'Ana' });
    expect(res.status).toBe(401);
  });

  it('retorna 401 com token inválido', async () => {
    const { user } = await createUserAndToken();
    const res = await request(app)
      .put(`/v1/user/${user.id}`)
      .set(bearer('token.invalido.aqui'))
      .send({ firstname: 'Ana' });
    expect(res.status).toBe(401);
  });

  it('retorna 401 com token expirado', async () => {
    const { user } = await createUserAndToken();
    const expired = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: -10 });
    const res = await request(app)
      .put(`/v1/user/${user.id}`)
      .set(bearer(expired))
      .send({ firstname: 'Ana' });
    expect(res.status).toBe(401);
  });

  it('retorna 400 com dados incorretos', async () => {
    const { user, token } = await createUserAndToken();
    const res = await request(app)
      .put(`/v1/user/${user.id}`)
      .set(bearer(token))
      .send({ email: 'invalido' });
    expect(res.status).toBe(400);
  });

  it('retorna 400 quando o e-mail pertence a outro usuário', async () => {
    const { token } = await createUserAndToken();
    const other = await request(app)
      .post('/v1/user')
      .send({ ...validUser, email: 'outro@mail.com' });

    const res = await request(app)
      .put(`/v1/user/${other.body.id}`)
      .set(bearer(token))
      .send({ email: 'maria@mail.com' });
    expect(res.status).toBe(400);
  });

  it('retorna 404 quando o usuário não existe', async () => {
    const { token } = await createUserAndToken();
    const res = await request(app)
      .put('/v1/user/999')
      .set(bearer(token))
      .send({ firstname: 'Ana' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /v1/user/:id', () => {
  it('remove o usuário (204)', async () => {
    const { user, token } = await createUserAndToken();

    const res = await request(app).delete(`/v1/user/${user.id}`).set(bearer(token));
    expect(res.status).toBe(204);

    const after = await request(app).get(`/v1/user/${user.id}`);
    expect(after.status).toBe(404);
  });

  it('retorna 401 sem token', async () => {
    const { user } = await createUserAndToken();
    const res = await request(app).delete(`/v1/user/${user.id}`);
    expect(res.status).toBe(401);
  });

  it('retorna 404 quando não existe', async () => {
    const { token } = await createUserAndToken();
    const res = await request(app).delete('/v1/user/999').set(bearer(token));
    expect(res.status).toBe(404);
  });
});
