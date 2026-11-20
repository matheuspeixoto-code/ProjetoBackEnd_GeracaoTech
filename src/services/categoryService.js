const { sequelize, Category, ProductCategory } = require('../models');
const { badRequest, notFound } = require('./httpError');
const {
  isNonEmptyString,
  parseId,
  parseBooleanQuery,
  parsePagination,
  parseFields,
  pick,
} = require('./validation');

const FIELDS = ['id', 'name', 'slug', 'use_in_menu'];

const serialize = (category) => ({
  id: category.id,
  name: category.name,
  slug: category.slug,
  use_in_menu: Boolean(category.use_in_menu),
});

async function findOrFail(id) {
  const categoryId = parseId(id);
  if (!categoryId) throw notFound('category not found');
  const category = await Category.findByPk(categoryId);
  if (!category) throw notFound('category not found');
  return category;
}

function validate(body, { partial }) {
  const data = {};

  for (const field of ['name', 'slug']) {
    if (body[field] === undefined) {
      if (!partial) throw badRequest(`${field} is required`);
      continue;
    }
    if (!isNonEmptyString(body[field])) {
      throw badRequest(`${field} must be a non-empty string`);
    }
    data[field] = body[field].trim();
  }

  if (body.use_in_menu !== undefined) {
    if (typeof body.use_in_menu !== 'boolean') {
      throw badRequest('use_in_menu must be a boolean');
    }
    data.use_in_menu = body.use_in_menu;
  }

  return data;
}

async function search(query) {
  const { limit, page, offset } = parsePagination(query);
  const fields = parseFields(query.fields, FIELDS);

  const where = {};
  if (query.use_in_menu !== undefined) {
    const useInMenu = parseBooleanQuery(query.use_in_menu);
    if (useInMenu === undefined) throw badRequest('use_in_menu must be true or false');
    where.use_in_menu = useInMenu;
  }

  const total = await Category.count({ where });
  const rows = await Category.findAll({
    where,
    order: [['id', 'ASC']],
    ...(limit !== -1 ? { limit, offset } : {}),
  });

  return {
    data: rows.map((row) => pick(serialize(row), fields)),
    total,
    limit,
    page,
  };
}

async function getById(id) {
  return serialize(await findOrFail(id));
}

async function create(body) {
  const data = validate(body, { partial: false });
  const category = await Category.create(data);
  return serialize(category);
}

async function update(id, body) {
  const category = await findOrFail(id);
  const data = validate(body, { partial: true });
  if (!Object.keys(data).length) throw badRequest('no valid fields to update');
  await category.update(data);
}

async function remove(id) {
  const category = await findOrFail(id);
  await sequelize.transaction(async (transaction) => {
    await ProductCategory.destroy({ where: { category_id: category.id }, transaction });
    await category.destroy({ transaction });
  });
}

module.exports = { search, getById, create, update, remove };
