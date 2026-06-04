export interface ErrorResponseBody {
  error: {
    code: string;
    message: string;
  };
}

export interface MappedHttpError {
  body: ErrorResponseBody;
  shouldLog: boolean;
  statusCode: number;
}

export class DomainError extends Error {
  public readonly code: string;

  public constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export class HttpError extends DomainError {
  public readonly statusCode: number;

  public constructor(statusCode: number, code: string, message: string) {
    super(code, message);
    this.statusCode = statusCode;
  }
}

export class RequestValidationError extends HttpError {
  public constructor(code: string, message: string) {
    super(400, code, message);
  }
}

export class UnsupportedMediaTypeError extends HttpError {
  public constructor(code: string, message: string) {
    super(415, code, message);
  }
}

export class NotFoundError extends HttpError {
  public constructor(code: string, message: string) {
    super(404, code, message);
  }
}

export class UpstreamStorageError extends HttpError {
  public constructor(code: string, message: string) {
    super(502, code, message);
  }
}

export class UploadFileError extends DomainError {}

export class UploadValidationError extends UploadFileError {}

export class UploadStorageError extends UploadFileError {}

export function mapErrorToHttpResponse(error: unknown): MappedHttpError {
  if (error instanceof HttpError) {
    return {
      statusCode: error.statusCode,
      shouldLog: false,
      body: {
        error: {
          code: error.code,
          message: error.message,
        },
      },
    };
  }

  const message = error instanceof Error ? error.message : "Unexpected server error";

  return {
    statusCode: 500,
    shouldLog: true,
    body: {
      error: {
        code: "internal_server_error",
        message,
      },
    },
  };
}
