export class AppError extends Error {
  constructor(code, message, status = 503, details = {}) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}
