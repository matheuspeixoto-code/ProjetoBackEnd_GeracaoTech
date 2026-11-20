const { request, app, sequelize, resetDatabase, createUserAndToken, bearer } = require('./helpers');

let token;

beforeEach(async () => {
  await resetDatabase();
  ({ token } = await createUserAndToken());
});
afterAll(() => sequelize.close());

const create = (body) => request(app).post('/v1/category').set(bearer(token)).send(body);

describe('POST /v1/category', () => {
  it('cria a categoria (201)', async () => {
    const res = await create({ name: 'Shoes', slug: 'shoes', use_in_menu: true });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: expect.any(Number), name: 'Shoes', slug: 'shoes', use_in_menu: true });
  });

  it('usa use_in_menu = false por padrão', async () => {
    const res = await create({ name: 'Shoes', slug: 'shoes' });
    expect(res.status).toBe(201);
    expect(res.body.use_in_menu).toBe(false);
  });

  it('retorna 401 sem token', async () => {
    const res = await request(app).post('/v1/category').send({ name: 'Shoes', slug: 'shoes' });
    expect(res.status).toBe(401);
  });

  it.each([
    ['sem name', { slug: 'shoes' }],
    ['sem slug', { name: 'Shoes' }],
    ['name vazio', { name: '  ', slug: 'shoes' }],
    ['use_in_menu não booleano', { name: 'Shoes', slug: 'shoes', use_in_menu: 'sim' }],
  ])('retorna 400 %s', async (_name, body) => {
    const res = await create(body);
    expect(res.status).toBe(400);
  });
});

describe('GET /v1/category/:id', () => {
  it('retorna a categoria (200)', async () => {
    const created = await create({ name: 'Shoes', slug: 'shoes', use_in_menu: true });
    const res = await request(app).get(`/v1/category/${created.body.id}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: created.body.id, name: 'Shoes', slug: 'shoes', use_in_menu: true });
  });

  it('retorna 404 quando não existe', async () => {
    const res = await request(app).get('/v1/category/999');
    expect(res.status).toBe(404);
  });
});

describe('GET /v1/category/search', () => {
  beforeEach(async () => {
    for (let i = 1; i <= 15; i += 1) {
      await create({ name: `Cat ${i}`, slug: `cat-${i}`, use_in_menu: i % 3 === 0 });
    }
  });

  it('usa limit=12 e page=1 por padrão', async () => {
    const res = await request(app).get('/v1/category/search');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(12);
    expect(res.body).toMatchObject({ total: 15, limit: 12, page: 1 });
  });

  it('pagina os resultados', async () => {
    const res = await request(app).get('/v1/category/search?limit=10&page=2');

    expect(res.body.data).toHaveLength(5);
    expect(res.body.data[0].name).toBe('Cat 11');
    expect(res.body).toMatchObject({ total: 15, limit: 10, page: 2 });
  });

  it('limit=-1 retorna todos os itens', async () => {
    const res = await request(app).get('/v1/category/search?limit=-1');

    expect(res.body.data).toHaveLength(15);
    expect(res.body).toMatchObject({ total: 15, limit: -1, page: 1 });
  });

  it('limit=-1 ignora o page', async () => {
    const res = await request(app).get('/v1/category/search?limit=-1&page=5');
    expect(res.body.data).toHaveLength(15);
  });

  it('filtra por use_in_menu=true', async () => {
    const res = await request(app).get('/v1/category/search?limit=-1&use_in_menu=true');

    expect(res.body.total).toBe(5);
    expect(res.body.data.every((item) => item.use_in_menu === true)).toBe(true);
  });

  it('limita os campos retornados com fields', async () => {
    const res = await request(app).get('/v1/category/search?limit=2&fields=name,slug');

    expect(res.body.data[0]).toEqual({ name: 'Cat 1', slug: 'cat-1' });
  });

  it.each([
    ['limit=abc'],
    ['limit=0'],
    ['limit=-5'],
    ['page=0'],
    ['page=abc'],
    ['fields=nao_existe'],
    ['use_in_menu=talvez'],
  ])('retorna 400 com %s', async (query) => {
    const res = await request(app).get(`/v1/category/search?${query}`);
    expect(res.status).toBe(400);
  });
});

describe('PUT /v1/category/:id', () => {
  it('atualiza a categoria (204)', async () => {
    const created = await create({ name: 'Shoes', slug: 'shoes' });

    const res = await request(app)
      .put(`/v1/category/${created.body.id}`)
      .set(bearer(token))
      .send({ name: 'Tênis', slug: 'tenis', use_in_menu: true });

    expect(res.status).toBe(204);
    expect(res.text).toBe('');

    const after = await request(app).get(`/v1/category/${created.body.id}`);
    expect(after.body).toEqual({ id: created.body.id, name: 'Tênis', slug: 'tenis', use_in_menu: true });
  });

  it('retorna 401 sem token', async () => {
    const created = await create({ name: 'Shoes', slug: 'shoes' });
    const res = await request(app).put(`/v1/category/${created.body.id}`).send({ name: 'X' });
    expect(res.status).toBe(401);
  });

  it('retorna 400 com dados incorretos', async () => {
    const created = await create({ name: 'Shoes', slug: 'shoes' });
    const res = await request(app)
      .put(`/v1/category/${created.body.id}`)
      .set(bearer(token))
      .send({ name: '' });
    expect(res.status).toBe(400);
  });

  it('retorna 404 quando não existe', async () => {
    const res = await request(app)
      .put('/v1/category/999')
      .set(bearer(token))
      .send({ name: 'X', slug: 'x' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /v1/category/:id', () => {
  it('remove a categoria (204)', async () => {
    const created = await create({ name: 'Shoes', slug: 'shoes' });

    const res = await request(app).delete(`/v1/category/${created.body.id}`).set(bearer(token));
    expect(res.status).toBe(204);

    const after = await request(app).get(`/v1/category/${created.body.id}`);
    expect(after.status).toBe(404);
  });

  it('retorna 401 sem token', async () => {
    const created = await create({ name: 'Shoes', slug: 'shoes' });
    const res = await request(app).delete(`/v1/category/${created.body.id}`);
    expect(res.status).toBe(401);
  });

  it('retorna 404 quando não existe', async () => {
    const res = await request(app).delete('/v1/category/999').set(bearer(token));
    expect(res.status).toBe(404);
  });
});
