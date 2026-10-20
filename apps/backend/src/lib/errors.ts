/** Shape every error response takes, so the frontend can rely on it. */
export interface ErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export class AppError extends Error {
  readonly status: 400 | 401 | 403 | 404 | 409 | 422 | 500;
  readonly code: string;
  readonly details?: unknown;

  constructor(
    status: AppError["status"],
    code: string,
    message: string,
    details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message: string, details?: unknown): AppError {
    return new AppError(400, "BAD_REQUEST", message, details);
  }

  static unauthorized(message = "Authentication required"): AppError {
    return new AppError(401, "UNAUTHORIZED", message);
  }

  static forbidden(message: string): AppError {
    return new AppError(403, "FORBIDDEN", message);
  }

  static notFound(message: string): AppError {
    return new AppError(404, "NOT_FOUND", message);
  }

  /** Optimistic-locking rejection: the row changed since the client read it. */
  static versionConflict(message: string, details?: unknown): AppError {
    return new AppError(409, "VERSION_CONFLICT", message, details);
  }

  toBody(): ErrorBody {
    return {
      error: { code: this.code, message: this.message, details: this.details },
    };
  }
}
