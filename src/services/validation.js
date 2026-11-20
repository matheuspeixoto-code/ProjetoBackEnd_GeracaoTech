const { badRequest } = require('./httpError');

const isNonEmptyString = (value) =>
  typeof value === 'string' && value.trim().length > 0;

// Converte o :id da rota em inteiro positivo (ou null se for inválido).
function parseId(value) {
  if (!/^\d+$/.test(String(value))) return null;
  const id = Number(value);
  return id > 0 ? id : null;
}

// "true"/"1" -> true, "false"/"0" -> false, qualquer outra coisa -> undefined.
function parseBooleanQuery(value) {
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return undefined;
}

// limit (padrão 12, -1 = todos) e page (padrão 1).
function parsePagination(query) {
  let limit = 12;
  let page = 1;

  if (query.limit !== undefined) {
    if (!/^-?\d+$/.test(String(query.limit))) {
      throw badRequest('limit must be an integer');
    }
    limit = Number(query.limit);
    if (limit === 0 || limit < -1) {
      throw badRequest('limit must be -1 or a positive integer');
    }
  }

  if (query.page !== undefined) {
    if (!/^\d+$/.test(String(query.page)) || Number(query.page) < 1) {
      throw badRequest('page must be a positive integer');
    }
    page = Number(query.page);
  }

  const offset = limit === -1 ? 0 : (page - 1) * limit;
  return { limit, page, offset };
}

// fields=name,slug -> ['name', 'slug'] (valida contra a lista de campos permitidos).
function parseFields(raw, allowed) {
  if (raw === undefined) return null;
  if (typeof raw !== 'string') throw badRequest('fields must be a string');

  const fields = raw
    .split(',')
    .map((field) => field.trim())
    .filter(Boolean);

  if (!fields.length) throw badRequest('fields cannot be empty');

  const invalid = fields.filter((field) => !allowed.includes(field));
  if (invalid.length) {
    throw badRequest(`invalid fields: ${invalid.join(', ')}`);
  }
  return fields;
}

function pick(object, fields) {
  if (!fields) return object;
  const result = {};
  for (const field of fields) result[field] = object[field];
  return result;
}

// "15,24" -> [15, 24]
function parseIdList(raw, name) {
  if (typeof raw !== 'string') throw badRequest(`${name} must be a comma-separated list of ids`);
  const parts = raw.split(',').map((part) => part.trim());
  if (!parts.length || parts.some((part) => parseId(part) === null)) {
    throw badRequest(`${name} must be a comma-separated list of positive integers`);
  }
  return parts.map(Number);
}

module.exports = {
  isNonEmptyString,
  parseId,
  parseBooleanQuery,
  parsePagination,
  parseFields,
  parseIdList,
  pick,
};
