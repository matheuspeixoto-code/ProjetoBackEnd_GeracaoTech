const fs = require('fs');
const path = require('path');
const {
  request,
  app,
  sequelize,
  PNG_BASE64,
  resetDatabase,
  createUserAndToken,
  bearer,
} = require('./helpers');
const imageService = require('../src/services/imageService');
const { ProductImage } = require('../src/models');

let token;
let categoryIds;

const createCategory = async (name) => {
  const res = await request(app)
    .post('/v1/category')
    .set(bearer(token))
    .send({ name, slug: name.toLowerCase() });
  return res.body.id;
};

const baseProduct = (overrides = {}) => ({
  enabled: true,
  name: 'Produto 01',
  slug: 'produto-01',
  stock: 10,
  description: 'Descrição do produto 01',
  price: 119.9,
  price_with_discount: 99.9,
  category_ids: categoryIds,
  images: [{ type: 'image/png', content: PNG_BASE64 }],
  options: [
    { title: 'Tamanho', shape: 'square', radius: '4px', type: 'text', values: ['PP', 'M', 'GG'] },
    { title: 'Cor', shape: 'circle', type: 'color', values: ['#000', '#333'] },
  ],
  ...overrides,
});

const createProduct = (overrides) =>
  request(app).post('/v1/product').set(bearer(token)).send(baseProduct(overrides));

beforeEach(async () => {
  await resetDatabase();
  ({ token } = await createUserAndToken());
  categoryIds = [await createCategory('Shoes'), await createCategory('Offers')];
});

afterAll(async () => {
  await sequelize.close();
  fs.rmSync(imageService.MEDIA_DIR, { recursive: true, force: true });
});

describe('POST /v1/product', () => {
  it('cria o produto com categorias, imagens e opções (201)', async () => {
    const res = await createProduct();

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id: expect.any(Number),
      enabled: true,
      name: 'Produto 01',
      slug: 'produto-01',
      stock: 10,
      description: 'Descrição do produto 01',
      price: 119.9,
      price_with_discount: 99.9,
      category_ids: categoryIds,
    });
    expect(res.body.images).toHaveLength(1);
    expect(res.body.options).toHaveLength(2);
  });

  it('salva a imagem em disco e devolve uma URL acessível', async () => {
    const res = await createProduct();
    const { id, content } = res.body.images[0];

    expect(id).toEqual(expect.any(Number));
    expect(content).toMatch(/^http:\/\/localhost:3000\/media\/product-\d+\/.+\.png$/);

    const image = await ProductImage.findByPk(id);
    expect(fs.existsSync(path.join(imageService.MEDIA_DIR, image.path))).toBe(true);

    const served = await request(app).get(new URL(content).pathname);
    expect(served.status).toBe(200);
    expect(served.headers['content-type']).toMatch(/image\/png/);
  });

  it('grava as opções com values separados por vírgula e aplica os padrões', async () => {
    const res = await createProduct({
      options: [{ title: 'Material', values: ['100% algodão'] }],
    });

    expect(res.body.options[0]).toMatchObject({
      title: 'Material',
      shape: 'square',
      radius: 0,
      type: 'text',
      values: ['100% algodão'],
    });
  });

  it('converte radius "4px" em inteiro', async () => {
    const res = await createProduct();
    expect(res.body.options[0].radius).toBe(4);
  });

  it('aceita "value" no lugar de "values" nas opções (como no exemplo do escopo)', async () => {
    const res = await createProduct({
      options: [{ title: 'Cor', value: ['PP', 'GG'] }],
    });
    expect(res.status).toBe(201);
    expect(res.body.options[0].values).toEqual(['PP', 'GG']);
  });

  it('usa enabled=false e stock=0 por padrão', async () => {
    const res = await createProduct({ enabled: undefined, stock: undefined });
    expect(res.status).toBe(201);
    expect(res.body.enabled).toBe(false);
    expect(res.body.stock).toBe(0);
  });

  it('cria sem categorias, imagens e opções', async () => {
    const res = await createProduct({
      category_ids: undefined,
      images: undefined,
      options: undefined,
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ category_ids: [], images: [], options: [] });
  });

  it('retorna 401 sem token', async () => {
    const res = await request(app).post('/v1/product').send(baseProduct());
    expect(res.status).toBe(401);
  });

  it.each([
    ['sem name', { name: undefined }],
    ['sem slug', { slug: undefined }],
    ['sem price', { price: undefined }],
    ['sem price_with_discount', { price_with_discount: undefined }],
    ['price negativo', { price: -1 }],
    ['price como string', { price: 'caro' }],
    ['stock decimal', { stock: 1.5 }],
    ['enabled não booleano', { enabled: 'sim' }],
    ['categoria inexistente', { category_ids: [9999] }],
    ['category_ids inválido', { category_ids: 'abc' }],
    ['imagem com tipo não suportado', { images: [{ type: 'application/pdf', content: PNG_BASE64 }] }],
    ['imagem com base64 inválido', { images: [{ type: 'image/png', content: '***' }] }],
    ['imagem sem content', { images: [{ type: 'image/png' }] }],
    ['opção sem title', { options: [{ values: ['a'] }] }],
    ['opção sem values', { options: [{ title: 'Tam' }] }],
    ['opção com shape inválido', { options: [{ title: 'Tam', shape: 'triangle', values: ['a'] }] }],
    ['opção com type inválido', { options: [{ title: 'Tam', type: 'number', values: ['a'] }] }],
  ])('retorna 400 %s', async (_name, overrides) => {
    const res = await createProduct(overrides);
    expect(res.status).toBe(400);
  });

  it('não cria nada quando a validação falha', async () => {
    await createProduct({ options: [{ title: 'Tam' }] });
    const list = await request(app).get('/v1/product/search?limit=-1');
    expect(list.body.total).toBe(0);
  });
});

describe('GET /v1/product/:id', () => {
  it('retorna o produto completo (200)', async () => {
    const created = await createProduct();
    const res = await request(app).get(`/v1/product/${created.body.id}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(created.body);
    expect(res.body.options[0]).toEqual({
      id: expect.any(Number),
      title: 'Tamanho',
      shape: 'square',
      radius: 4,
      type: 'text',
      values: ['PP', 'M', 'GG'],
    });
  });

  it('retorna 404 quando não existe', async () => {
    const res = await request(app).get('/v1/product/999');
    expect(res.status).toBe(404);
  });
});

describe('GET /v1/product/search', () => {
  let products;

  beforeEach(async () => {
    const [shoes, offers] = categoryIds;
    products = [];
    const specs = [
      { name: 'Tênis Corrida', slug: 'tenis-corrida', price: 150, price_with_discount: 120, category_ids: [shoes], description: 'Leve', options: [{ title: 'Tam', values: ['40', '41'] }] },
      { name: 'Camiseta', slug: 'camiseta', price: 50, price_with_discount: 40, category_ids: [offers], description: 'Ideal para tênis de corrida', options: [{ title: 'Tam', values: ['PP', 'GG'] }] },
      { name: 'Mochila', slug: 'mochila', price: 300, price_with_discount: 250, category_ids: [shoes, offers], description: 'Resistente', options: [{ title: 'Tam', values: ['M'] }] },
    ];
    for (const spec of specs) {
      const res = await createProduct({ ...spec, images: undefined });
      products.push(res.body);
    }
  });

  it('retorna a lista paginada com os padrões (limit=12, page=1)', async () => {
    const res = await request(app).get('/v1/product/search');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 3, limit: 12, page: 1 });
    expect(res.body.data).toHaveLength(3);
    expect(res.body.data[0]).toHaveProperty('category_ids');
    expect(res.body.data[0]).toHaveProperty('images');
    expect(res.body.data[0]).toHaveProperty('options');
  });

  it('pagina com limit e page', async () => {
    const res = await request(app).get('/v1/product/search?limit=2&page=2');
    expect(res.body.data).toHaveLength(1);
    expect(res.body).toMatchObject({ total: 3, limit: 2, page: 2 });
  });

  it('limit=-1 retorna tudo', async () => {
    const res = await request(app).get('/v1/product/search?limit=-1');
    expect(res.body.data).toHaveLength(3);
    expect(res.body.limit).toBe(-1);
  });

  it('limita os campos com fields', async () => {
    const res = await request(app).get('/v1/product/search?fields=name,images,price&limit=1');
    expect(Object.keys(res.body.data[0]).sort()).toEqual(['images', 'name', 'price']);
  });

  it('filtra por match no nome ou na descrição', async () => {
    const res = await request(app).get(`/v1/product/search?match=${encodeURIComponent('tênis')}`);
    expect(res.body.data.map((p) => p.name).sort()).toEqual(['Camiseta', 'Tênis Corrida']);
  });

  it('filtra por category_ids', async () => {
    const [shoes] = categoryIds;
    const res = await request(app).get(`/v1/product/search?category_ids=${shoes}`);
    expect(res.body.data.map((p) => p.name).sort()).toEqual(['Mochila', 'Tênis Corrida']);
  });

  it('filtra por mais de uma categoria (qualquer uma delas)', async () => {
    const res = await request(app).get(`/v1/product/search?category_ids=${categoryIds.join(',')}`);
    expect(res.body.total).toBe(3);
  });

  it('filtra por price-range', async () => {
    const res = await request(app).get('/v1/product/search?price-range=100-200');
    expect(res.body.data.map((p) => p.name)).toEqual(['Tênis Corrida']);
  });

  it('filtra por option[id]=valores', async () => {
    const optionId = products[1].options[0].id;
    const res = await request(app).get(`/v1/product/search?option[${optionId}]=GG,XG`);

    expect(res.status).toBe(200);
    expect(res.body.data.map((p) => p.name)).toEqual(['Camiseta']);
  });

  it('retorna vazio quando option[id] não combina', async () => {
    const optionId = products[1].options[0].id;
    const res = await request(app).get(`/v1/product/search?option[${optionId}]=XXG`);
    expect(res.body).toMatchObject({ data: [], total: 0 });
  });

  it('combina filtros', async () => {
    const [shoes] = categoryIds;
    const res = await request(app).get(`/v1/product/search?category_ids=${shoes}&price-range=200-400`);
    expect(res.body.data.map((p) => p.name)).toEqual(['Mochila']);
  });

  it.each([
    ['limit=abc'],
    ['page=0'],
    ['fields=foo'],
    ['category_ids=a,b'],
    ['price-range=abc'],
    ['price-range=200-100'],
    ['option[x]=GG'],
    ['option=GG'],
  ])('retorna 400 com %s', async (query) => {
    const res = await request(app).get(`/v1/product/search?${query}`);
    expect(res.status).toBe(400);
  });
});

describe('PUT /v1/product/:id', () => {
  let product;

  beforeEach(async () => {
    const res = await createProduct({
      images: [
        { type: 'image/png', content: PNG_BASE64 },
        { type: 'image/png', content: PNG_BASE64 },
      ],
    });
    product = res.body;
  });

  const put = (body, id = product.id) =>
    request(app).put(`/v1/product/${id}`).set(bearer(token)).send(body);

  it('atualiza os campos simples (204)', async () => {
    const res = await put({ name: 'Produto atualizado', price: 49.9, price_with_discount: 0, stock: 20 });

    expect(res.status).toBe(204);
    expect(res.text).toBe('');

    const after = await request(app).get(`/v1/product/${product.id}`);
    expect(after.body).toMatchObject({
      name: 'Produto atualizado',
      price: 49.9,
      price_with_discount: 0,
      stock: 20,
      slug: 'produto-01',
    });
  });

  it('substitui as categorias', async () => {
    await put({ category_ids: [categoryIds[0]] });
    const after = await request(app).get(`/v1/product/${product.id}`);
    expect(after.body.category_ids).toEqual([categoryIds[0]]);
  });

  it('remove todas as categorias com []', async () => {
    await put({ category_ids: [] });
    const after = await request(app).get(`/v1/product/${product.id}`);
    expect(after.body.category_ids).toEqual([]);
  });

  it('deleta, substitui e adiciona imagens', async () => {
    const [first, second] = product.images;
    const firstPath = (await ProductImage.findByPk(first.id)).path;
    const secondPath = (await ProductImage.findByPk(second.id)).path;

    const res = await put({
      images: [
        { type: 'image/png', content: PNG_BASE64 }, // nova
        { id: second.id, deleted: true }, // removida
        { id: first.id, content: PNG_BASE64 }, // substituída (base64)
      ],
    });
    expect(res.status).toBe(204);

    const after = await request(app).get(`/v1/product/${product.id}`);
    const ids = after.body.images.map((image) => image.id);
    expect(after.body.images).toHaveLength(2);
    expect(ids).toContain(first.id);
    expect(ids).not.toContain(second.id);

    // arquivos antigos foram apagados do disco
    expect(fs.existsSync(path.join(imageService.MEDIA_DIR, secondPath))).toBe(false);
    expect(fs.existsSync(path.join(imageService.MEDIA_DIR, firstPath))).toBe(false);
    // e o novo caminho da imagem substituída existe
    const replaced = await ProductImage.findByPk(first.id);
    expect(replaced.path).not.toBe(firstPath);
    expect(fs.existsSync(path.join(imageService.MEDIA_DIR, replaced.path))).toBe(true);
  });

  it('mantém a imagem quando recebe a própria URL em content', async () => {
    const [first] = product.images;
    const before = await ProductImage.findByPk(first.id);

    const res = await put({ images: [{ id: first.id, content: first.content }] });
    expect(res.status).toBe(204);

    const after = await ProductImage.findByPk(first.id);
    expect(after.path).toBe(before.path);
    expect(fs.existsSync(path.join(imageService.MEDIA_DIR, after.path))).toBe(true);
  });

  it('deleta, atualiza e adiciona opções', async () => {
    const [sizeOption, colorOption] = product.options;

    const res = await put({
      options: [
        { id: sizeOption.id, deleted: true },
        { id: colorOption.id, radius: '10px', value: ['42/43', '44/45'] },
        { title: 'Tipo', shape: 'square', type: 'text', values: ['100% algodão', '65% algodão'] },
      ],
    });
    expect(res.status).toBe(204);

    const after = await request(app).get(`/v1/product/${product.id}`);
    expect(after.body.options).toHaveLength(2);

    const updated = after.body.options.find((option) => option.id === colorOption.id);
    expect(updated).toMatchObject({
      title: 'Cor', // não enviado -> preservado
      shape: 'circle',
      radius: 10,
      values: ['42/43', '44/45'],
    });
    expect(after.body.options.find((option) => option.title === 'Tipo').values).toEqual([
      '100% algodão',
      '65% algodão',
    ]);
    expect(after.body.options.find((option) => option.id === sizeOption.id)).toBeUndefined();
  });

  it('não altera nada quando um dos itens é inválido (atomicidade)', async () => {
    const res = await put({
      name: 'Nome que não deve ser salvo',
      options: [{ id: 99999, deleted: true }],
    });
    expect(res.status).toBe(400);

    const after = await request(app).get(`/v1/product/${product.id}`);
    expect(after.body.name).toBe('Produto 01');
  });

  it('retorna 401 sem token', async () => {
    const res = await request(app).put(`/v1/product/${product.id}`).send({ name: 'X' });
    expect(res.status).toBe(401);
  });

  it.each([
    ['name vazio', { name: '' }],
    ['price negativo', { price: -5 }],
    ['categoria inexistente', { category_ids: [9999] }],
    ['imagem de outro produto', { images: [{ id: 99999, deleted: true }] }],
    ['opção com shape inválido', { options: [{ title: 'x', shape: 'oval', values: ['a'] }] }],
    ['corpo vazio', {}],
  ])('retorna 400 %s', async (_name, body) => {
    const res = await put(body);
    expect(res.status).toBe(400);
  });

  it('retorna 404 quando o produto não existe', async () => {
    const res = await put({ name: 'X' }, 999);
    expect(res.status).toBe(404);
  });
});

describe('DELETE /v1/product/:id', () => {
  it('remove o produto, suas relações e os arquivos de imagem (204)', async () => {
    const created = await createProduct();
    const image = await ProductImage.findByPk(created.body.images[0].id);
    const file = path.join(imageService.MEDIA_DIR, image.path);
    expect(fs.existsSync(file)).toBe(true);

    const res = await request(app).delete(`/v1/product/${created.body.id}`).set(bearer(token));
    expect(res.status).toBe(204);
    expect(res.text).toBe('');

    const after = await request(app).get(`/v1/product/${created.body.id}`);
    expect(after.status).toBe(404);
    expect(await ProductImage.count()).toBe(0);
    expect(fs.existsSync(file)).toBe(false);
  });

  it('retorna 401 sem token', async () => {
    const created = await createProduct();
    const res = await request(app).delete(`/v1/product/${created.body.id}`);
    expect(res.status).toBe(401);
  });

  it('retorna 404 quando não existe', async () => {
    const res = await request(app).delete('/v1/product/999').set(bearer(token));
    expect(res.status).toBe(404);
  });
});

describe('Excluir categoria vinculada a produto', () => {
  it('remove o vínculo e mantém o produto', async () => {
    const created = await createProduct();

    const del = await request(app).delete(`/v1/category/${categoryIds[0]}`).set(bearer(token));
    expect(del.status).toBe(204);

    const after = await request(app).get(`/v1/product/${created.body.id}`);
    expect(after.status).toBe(200);
    expect(after.body.category_ids).toEqual([categoryIds[1]]);
  });
});
