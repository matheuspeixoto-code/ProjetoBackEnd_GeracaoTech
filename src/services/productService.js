const path = require('path');
const { Op } = require('sequelize');
const {
  sequelize,
  Product,
  Category,
  ProductImage,
  ProductOption,
  ProductCategory,
} = require('../models');
const imageService = require('./imageService');
const { badRequest, notFound } = require('./httpError');
const {
  isNonEmptyString,
  parseId,
  parsePagination,
  parseFields,
  parseIdList,
  pick,
} = require('./validation');

const PRODUCT_FIELDS = [
  'id',
  'enabled',
  'name',
  'slug',
  'use_in_menu',
  'stock',
  'description',
  'price',
  'price_with_discount',
  'category_ids',
  'images',
  'options',
];
const SHAPES = ['square', 'circle'];
const OPTION_TYPES = ['text', 'color'];

/* ------------------------------------------------------------------ */
/* Serialização                                                        */
/* ------------------------------------------------------------------ */

const splitValues = (values) =>
  String(values)
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

function serialize(product, categoryIds) {
  return {
    id: product.id,
    enabled: Boolean(product.enabled),
    name: product.name,
    slug: product.slug,
    use_in_menu: Boolean(product.use_in_menu),
    stock: product.stock,
    description: product.description,
    price: product.price,
    price_with_discount: product.price_with_discount,
    category_ids: categoryIds,
    images: (product.images || []).map((image) => ({
      id: image.id,
      content: imageService.toUrl(image.path),
    })),
    options: (product.options || []).map((option) => ({
      id: option.id,
      title: option.title,
      shape: option.shape,
      radius: option.radius,
      type: option.type,
      values: splitValues(option.values),
    })),
  };
}

const includeRelations = () => [
  { model: ProductImage, as: 'images', separate: true, order: [['id', 'ASC']] },
  { model: ProductOption, as: 'options', separate: true, order: [['id', 'ASC']] },
];

async function loadCategoryIds(productIds) {
  const map = new Map();
  if (!productIds.length) return map;

  const links = await ProductCategory.findAll({
    where: { product_id: productIds },
    order: [['category_id', 'ASC']],
  });
  for (const link of links) {
    if (!map.has(link.product_id)) map.set(link.product_id, []);
    map.get(link.product_id).push(link.category_id);
  }
  return map;
}

/* ------------------------------------------------------------------ */
/* Validação                                                           */
/* ------------------------------------------------------------------ */

function validateProductFields(body, { partial }) {
  const data = {};

  if (!partial) {
    for (const field of ['name', 'slug', 'price', 'price_with_discount']) {
      if (body[field] === undefined || body[field] === null) {
        throw badRequest(`${field} is required`);
      }
    }
  }

  for (const field of ['name', 'slug']) {
    if (body[field] === undefined) continue;
    if (!isNonEmptyString(body[field])) {
      throw badRequest(`${field} must be a non-empty string`);
    }
    data[field] = body[field].trim();
  }

  if (body.description !== undefined && body.description !== null) {
    if (typeof body.description !== 'string') {
      throw badRequest('description must be a string');
    }
    data.description = body.description;
  }

  for (const field of ['enabled', 'use_in_menu']) {
    if (body[field] === undefined) continue;
    if (typeof body[field] !== 'boolean') throw badRequest(`${field} must be a boolean`);
    data[field] = body[field];
  }

  if (body.stock !== undefined) {
    if (!Number.isInteger(body.stock) || body.stock < 0) {
      throw badRequest('stock must be a non-negative integer');
    }
    data.stock = body.stock;
  }

  for (const field of ['price', 'price_with_discount']) {
    if (body[field] === undefined) continue;
    if (typeof body[field] !== 'number' || !Number.isFinite(body[field]) || body[field] < 0) {
      throw badRequest(`${field} must be a non-negative number`);
    }
    data[field] = body[field];
  }

  return data;
}

async function resolveCategoryIds(raw) {
  if (raw === undefined) return undefined;

  if (!Array.isArray(raw) || raw.some((id) => !Number.isInteger(id) || id < 1)) {
    throw badRequest('category_ids must be an array of positive integers');
  }

  const unique = [...new Set(raw)];
  if (unique.length) {
    const found = await Category.count({ where: { id: unique } });
    if (found !== unique.length) throw badRequest('one or more categories do not exist');
  }
  return unique;
}

// "4px" -> 4, 10 -> 10, qualquer outra coisa -> null
function parseRadius(value) {
  if (Number.isInteger(value) && value >= 0) return value;
  if (typeof value === 'string') {
    const match = /^(\d+)(px)?$/i.exec(value.trim());
    if (match) return Number(match[1]);
  }
  return null;
}

function normalizeValues(raw) {
  let list;
  if (Array.isArray(raw)) list = raw;
  else if (typeof raw === 'string') list = raw.split(',');
  else return null;

  list = list.map((value) => String(value).trim()).filter(Boolean);
  if (!list.length || list.some((value) => value.includes(','))) return null;
  return list;
}

function parseOptionFields(option, { partial }) {
  if (!option || typeof option !== 'object' || Array.isArray(option)) {
    throw badRequest('invalid option');
  }

  const data = {};

  if (!partial || option.title !== undefined) {
    if (!isNonEmptyString(option.title)) throw badRequest('option title is required');
    data.title = option.title.trim();
  }

  if (option.shape !== undefined) {
    if (!SHAPES.includes(option.shape)) {
      throw badRequest(`option shape must be one of: ${SHAPES.join(', ')}`);
    }
    data.shape = option.shape;
  }

  if (option.type !== undefined) {
    if (!OPTION_TYPES.includes(option.type)) {
      throw badRequest(`option type must be one of: ${OPTION_TYPES.join(', ')}`);
    }
    data.type = option.type;
  }

  if (option.radius !== undefined) {
    const radius = parseRadius(option.radius);
    if (radius === null) throw badRequest('option radius must be a non-negative integer');
    data.radius = radius;
  }

  // Aceita "values" e também "value" (o payload de exemplo usa os dois).
  const rawValues = option.values !== undefined ? option.values : option.value;
  if (!partial || rawValues !== undefined) {
    const list = normalizeValues(rawValues);
    if (!list) throw badRequest('option values must be a non-empty list without commas');
    data.values = list.join(',');
  }

  return data;
}

function parseNewImages(images) {
  if (images === undefined) return [];
  if (!Array.isArray(images)) throw badRequest('images must be an array');
  return images.map((image) => imageService.prepare(image));
}

function parseNewOptions(options) {
  if (options === undefined) return [];
  if (!Array.isArray(options)) throw badRequest('options must be an array');
  return options.map((option) => parseOptionFields(option, { partial: false }));
}

/* ------------------------------------------------------------------ */
/* Planejamento das alterações de imagens/opções no PUT                */
/* ------------------------------------------------------------------ */

async function planImages(productId, images) {
  if (images === undefined) return null;
  if (!Array.isArray(images)) throw badRequest('images must be an array');

  const existing = await ProductImage.findAll({ where: { product_id: productId } });
  const byId = new Map(existing.map((image) => [image.id, image]));
  const plan = { create: [], replace: [], remove: [] };

  for (const image of images) {
    if (!image || typeof image !== 'object' || Array.isArray(image)) {
      throw badRequest('invalid image');
    }

    if (image.id === undefined) {
      plan.create.push(imageService.prepare(image));
      continue;
    }

    const current = Number.isInteger(image.id) ? byId.get(image.id) : undefined;
    if (!current) throw badRequest(`image ${image.id} does not belong to this product`);

    if (image.deleted === true) {
      plan.remove.push(current);
    } else if (image.content !== undefined && !imageService.isUrl(image.content)) {
      // content em base64 -> substitui o arquivo; URL -> nada a alterar.
      const fallbackExt = path.extname(current.path).slice(1).toLowerCase();
      plan.replace.push({
        current,
        prepared: imageService.prepare(image, { fallbackExt }),
      });
    }
  }

  return plan;
}

async function planOptions(productId, options) {
  if (options === undefined) return null;
  if (!Array.isArray(options)) throw badRequest('options must be an array');

  const existing = await ProductOption.findAll({ where: { product_id: productId } });
  const ids = new Set(existing.map((option) => option.id));
  const plan = { create: [], update: [], remove: [] };

  for (const option of options) {
    if (!option || typeof option !== 'object' || Array.isArray(option)) {
      throw badRequest('invalid option');
    }

    if (option.id === undefined) {
      plan.create.push(parseOptionFields(option, { partial: false }));
      continue;
    }

    if (!Number.isInteger(option.id) || !ids.has(option.id)) {
      throw badRequest(`option ${option.id} does not belong to this product`);
    }

    if (option.deleted === true) {
      plan.remove.push(option.id);
    } else {
      const fields = parseOptionFields(option, { partial: true });
      if (Object.keys(fields).length) plan.update.push({ id: option.id, fields });
    }
  }

  return plan;
}

/* ------------------------------------------------------------------ */
/* Casos de uso                                                        */
/* ------------------------------------------------------------------ */

async function search(query) {
  const { limit, page, offset } = parsePagination(query);
  const fields = parseFields(query.fields, PRODUCT_FIELDS);

  const where = {};
  const idSets = [];

  if (query.match !== undefined) {
    if (typeof query.match !== 'string' || !query.match.trim()) {
      throw badRequest('match must be a non-empty string');
    }
    const term = `%${query.match.trim()}%`;
    where[Op.or] = [
      { name: { [Op.like]: term } },
      { description: { [Op.like]: term } },
    ];
  }

  if (query.category_ids !== undefined) {
    const categoryIds = parseIdList(query.category_ids, 'category_ids');
    const links = await ProductCategory.findAll({
      where: { category_id: categoryIds },
      attributes: ['product_id'],
    });
    idSets.push(new Set(links.map((link) => link.product_id)));
  }

  if (query['price-range'] !== undefined) {
    const match = /^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/.exec(String(query['price-range']).trim());
    if (!match) throw badRequest('price-range must be in the format min-max (e.g. 100-200)');
    const min = Number(match[1]);
    const max = Number(match[2]);
    if (min > max) throw badRequest('price-range min must be less than or equal to max');
    where.price = { [Op.between]: [min, max] };
  }

  // option[45]=GG,PP -> produtos cuja opção 45 tenha "GG" ou "PP" entre os valores
  if (query.option !== undefined) {
    if (typeof query.option !== 'object' || query.option === null) {
      throw badRequest('option must be in the format option[<id>]=value1,value2');
    }
    for (const [rawId, rawValues] of Object.entries(query.option)) {
      const optionId = parseId(rawId);
      if (!optionId || typeof rawValues !== 'string' || !rawValues.trim()) {
        throw badRequest('option must be in the format option[<id>]=value1,value2');
      }
      const wanted = splitValues(rawValues);
      const option = await ProductOption.findByPk(optionId);
      const matches =
        option && splitValues(option.values).some((value) => wanted.includes(value));
      idSets.push(new Set(matches ? [option.product_id] : []));
    }
  }

  if (idSets.length) {
    let ids = [...idSets[0]];
    for (const set of idSets.slice(1)) ids = ids.filter((id) => set.has(id));
    if (!ids.length) return { data: [], total: 0, limit, page };
    where.id = { [Op.in]: ids };
  }

  const total = await Product.count({ where });
  const products = await Product.findAll({
    where,
    include: includeRelations(),
    order: [['id', 'ASC']],
    ...(limit !== -1 ? { limit, offset } : {}),
  });

  const categoryIds = await loadCategoryIds(products.map((product) => product.id));
  const data = products.map((product) =>
    pick(serialize(product, categoryIds.get(product.id) || []), fields)
  );

  return { data, total, limit, page };
}

async function getById(id) {
  const productId = parseId(id);
  if (!productId) throw notFound('product not found');

  const product = await Product.findByPk(productId, { include: includeRelations() });
  if (!product) throw notFound('product not found');

  const categoryIds = await loadCategoryIds([product.id]);
  return serialize(product, categoryIds.get(product.id) || []);
}

async function create(body) {
  // Toda a validação acontece antes de qualquer escrita (banco ou disco).
  const data = validateProductFields(body, { partial: false });
  const categoryIds = await resolveCategoryIds(body.category_ids);
  const images = parseNewImages(body.images);
  const options = parseNewOptions(body.options);

  const savedPaths = [];
  try {
    const productId = await sequelize.transaction(async (transaction) => {
      const product = await Product.create(data, { transaction });

      if (categoryIds && categoryIds.length) {
        await ProductCategory.bulkCreate(
          categoryIds.map((categoryId) => ({ product_id: product.id, category_id: categoryId })),
          { transaction }
        );
      }

      if (options.length) {
        await ProductOption.bulkCreate(
          options.map((option) => ({ ...option, product_id: product.id })),
          { transaction }
        );
      }

      for (const prepared of images) {
        const relative = await imageService.save(product.id, prepared);
        savedPaths.push(relative);
        await ProductImage.create(
          { product_id: product.id, enabled: true, path: relative },
          { transaction }
        );
      }

      return product.id;
    });

    return await getById(productId);
  } catch (err) {
    await Promise.all(savedPaths.map((relative) => imageService.remove(relative)));
    throw err;
  }
}

async function update(id, body) {
  const productId = parseId(id);
  if (!productId) throw notFound('product not found');

  const product = await Product.findByPk(productId);
  if (!product) throw notFound('product not found');

  const data = validateProductFields(body, { partial: true });
  const categoryIds = await resolveCategoryIds(body.category_ids);
  const imagePlan = await planImages(productId, body.images);
  const optionPlan = await planOptions(productId, body.options);

  const nothingToUpdate =
    !Object.keys(data).length &&
    categoryIds === undefined &&
    imagePlan === null &&
    optionPlan === null;
  if (nothingToUpdate) throw badRequest('no valid fields to update');

  const savedPaths = [];
  const obsoletePaths = [];

  try {
    await sequelize.transaction(async (transaction) => {
      if (Object.keys(data).length) await product.update(data, { transaction });

      if (categoryIds !== undefined) {
        await ProductCategory.destroy({ where: { product_id: productId }, transaction });
        if (categoryIds.length) {
          await ProductCategory.bulkCreate(
            categoryIds.map((categoryId) => ({ product_id: productId, category_id: categoryId })),
            { transaction }
          );
        }
      }

      if (imagePlan) {
        for (const image of imagePlan.remove) {
          await image.destroy({ transaction });
          obsoletePaths.push(image.path);
        }
        for (const { current, prepared } of imagePlan.replace) {
          const relative = await imageService.save(productId, prepared);
          savedPaths.push(relative);
          obsoletePaths.push(current.path);
          await current.update({ path: relative }, { transaction });
        }
        for (const prepared of imagePlan.create) {
          const relative = await imageService.save(productId, prepared);
          savedPaths.push(relative);
          await ProductImage.create(
            { product_id: productId, enabled: true, path: relative },
            { transaction }
          );
        }
      }

      if (optionPlan) {
        if (optionPlan.remove.length) {
          await ProductOption.destroy({ where: { id: optionPlan.remove }, transaction });
        }
        for (const { id: optionId, fields } of optionPlan.update) {
          await ProductOption.update(fields, { where: { id: optionId }, transaction });
        }
        if (optionPlan.create.length) {
          await ProductOption.bulkCreate(
            optionPlan.create.map((option) => ({ ...option, product_id: productId })),
            { transaction }
          );
        }
      }
    });
  } catch (err) {
    await Promise.all(savedPaths.map((relative) => imageService.remove(relative)));
    throw err;
  }

  // Só apaga os arquivos antigos depois que o commit deu certo.
  await Promise.all(obsoletePaths.map((relative) => imageService.remove(relative)));
}

async function remove(id) {
  const productId = parseId(id);
  if (!productId) throw notFound('product not found');

  const product = await Product.findByPk(productId);
  if (!product) throw notFound('product not found');

  const images = await ProductImage.findAll({ where: { product_id: productId } });

  await sequelize.transaction(async (transaction) => {
    await ProductImage.destroy({ where: { product_id: productId }, transaction });
    await ProductOption.destroy({ where: { product_id: productId }, transaction });
    await ProductCategory.destroy({ where: { product_id: productId }, transaction });
    await product.destroy({ transaction });
  });

  await Promise.all(images.map((image) => imageService.remove(image.path)));
}

module.exports = { search, getById, create, update, remove };
