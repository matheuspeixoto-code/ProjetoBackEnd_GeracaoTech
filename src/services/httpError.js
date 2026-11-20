class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

module.exports = {
  HttpError,
  badRequest: (message) => new HttpError(400, message),
  unauthorized: (message) => new HttpError(401, message),
  notFound: (message) => new HttpError(404, message),
};
