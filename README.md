# Projeto Backend

API REST de e-commerce (usuários, categorias e produtos) com **Node.js, Express, Sequelize, MySQL, JWT e Jest**.

## Como rodar

### 1. Pré-requisitos
- Node.js 18+
- MySQL 8+ (ou MariaDB) rodando

### 2. Instalar dependências
```bash
npm install
```

### 3. Criar o banco de dados
```sql
CREATE DATABASE projeto_backend;
```

### 4. Configurar o `.env`
Copie o `.env.example` para `.env` e ajuste:

| Variável | Descrição | Padrão |
|---|---|---|
| `PORT` | Porta da API | `3000` |
| `BASE_URL` | URL pública usada para montar o link das imagens | `http://localhost:3000` |
| `DB_HOST` / `DB_PORT` | Endereço do MySQL | `localhost` / `3306` |
| `DB_NAME` / `DB_USER` / `DB_PASSWORD` | Credenciais do MySQL | `projeto_backend` / `root` / *(vazio)* |
| `JWT_SECRET` | **Troque** por uma chave longa e secreta | — |
| `JWT_EXPIRES_IN` | Validade do token | `1h` |

### 5. Subir a API
```bash
npm run dev     # desenvolvimento (nodemon)
npm start       # produção
```
As tabelas são criadas automaticamente na primeira execução (`sequelize.sync()`).

### 6. Rodar os testes
```bash
npm test
```
Os testes usam **SQLite em memória**, então não precisam de MySQL.

Para rodar a mesma suíte contra um MySQL de verdade, crie um banco **exclusivo de testes** e informe o nome em `TEST_DB_NAME` (as tabelas desse banco são apagadas e recriadas a cada teste, nunca use o banco real):
```bash
TEST_DB_NAME=projeto_backend_test npm test
```

## Autenticação

1. Cadastre um usuário: `POST /v1/user`
2. Gere o token: `POST /v1/user/token` com `{ "email", "password" }`
3. Envie nas rotas protegidas o header: `Authorization: Bearer <token>`

`POST`, `PUT` e `DELETE` exigem token (exceto `POST /v1/user` e `POST /v1/user/token`, que são o cadastro e o login). Os `GET` são públicos.

## Endpoints

| Método | Rota | Auth | Sucesso |
|---|---|---|---|
| POST | `/v1/user/token` | – | 200 |
| POST | `/v1/user` | – | 201 |
| GET | `/v1/user/:id` | – | 200 |
| PUT | `/v1/user/:id` | ✔ | 204 |
| DELETE | `/v1/user/:id` | ✔ | 204 |
| GET | `/v1/category/search` | – | 200 |
| GET | `/v1/category/:id` | – | 200 |
| POST | `/v1/category` | ✔ | 201 |
| PUT | `/v1/category/:id` | ✔ | 204 |
| DELETE | `/v1/category/:id` | ✔ | 204 |
| GET | `/v1/product/search` | – | 200 |
| GET | `/v1/product/:id` | – | 200 |
| POST | `/v1/product` | ✔ | 201 |
| PUT | `/v1/product/:id` | ✔ | 204 |
| DELETE | `/v1/product/:id` | ✔ | 204 |

Erros: `400` (dados inválidos), `401` (token ausente/inválido/expirado), `404` (recurso não existe).

### Busca de categorias — `GET /v1/category/search`
`limit` (padrão 12, `-1` = todos), `page` (padrão 1), `fields=name,slug`, `use_in_menu=true`.

### Busca de produtos — `GET /v1/product/search`
`limit`, `page`, `fields=name,images,price`, `match=Tênis` (nome ou descrição), `category_ids=15,24`, `price-range=100-200`, `option[45]=GG,PP`.
Os filtros podem ser combinados.

## Decisões de implementação

O escopo deixa alguns pontos em aberto. Estas foram as escolhas:

- **Imagens:** o base64 recebido é gravado em `public/media/product-<id>/` e servido em `/media/...`. A API devolve a URL completa (`BASE_URL` + caminho). No banco fica só o caminho relativo (`path`).
- **PUT de produto (imagens):** item sem `id` = nova imagem; `{ id, deleted: true }` = remove; `{ id, content: <base64> }` = substitui o arquivo; `{ id, content: <URL> }` = mantém como está.
- **PUT de produto (opções):** item sem `id` = nova opção; `{ id, deleted: true }` = remove; `{ id, ...campos }` = atualiza só os campos enviados.
- **Opções:** `radius` aceita `4` ou `"4px"` (gravado como inteiro). Os valores podem vir em `values` ou `value` (o exemplo do escopo usa os dois) e são gravados separados por vírgula, por isso um valor individual não pode conter vírgula.
- **`category_ids` no PUT:** quando enviado, **substitui** todas as categorias do produto (`[]` remove todas). Categorias inexistentes retornam 400.
- **Filtro `category_ids`:** retorna produtos que estejam em *qualquer* uma das categorias informadas.
- **Filtro `option[id]`:** retorna o produto dono da opção `id` se ela tiver *qualquer* um dos valores informados.
- **Atomicidade:** criação, atualização e exclusão de produto rodam em transação; se algo falhar, nada é salvo e os arquivos gravados são removidos.
- **Excluir categoria/produto:** remove também os vínculos em `product_categories` (o produto não é apagado ao excluir uma categoria).
- **Usuário:** e-mail único (normalizado para minúsculas), senha com no mínimo 6 caracteres, hash com bcrypt. A senha nunca é retornada.
- **Login inválido:** retorna 400, conforme o escopo.

## Estrutura

```
src/
├── config/       # banco e JWT
├── controllers/  # camada HTTP
├── middleware/   # auth JWT, tratamento de erros
├── models/       # models Sequelize e associações
├── routes/       # rotas /v1
├── services/     # regras de negócio e validações
├── app.js
└── server.js
tests/            # Jest + Supertest
```
