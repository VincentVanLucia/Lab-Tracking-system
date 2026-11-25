export class ApiError extends Error {
  constructor(status, code, message, fields = undefined) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export function validationError(fields, message = 'Some fields need attention. Correct the highlighted fields and try again.') {
  return new ApiError(422, 'VALIDATION_FAILED', message, fields);
}

export function notFound(message = 'Not found.') {
  return new ApiError(404, 'NOT_FOUND', message);
}
