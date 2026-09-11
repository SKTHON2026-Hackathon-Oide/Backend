export type SpaceAnalysisErrorCode =
  | 'INVALID_COORDINATE'
  | 'OUT_OF_SERVICE_AREA'
  | 'NO_BUILDING_NEAR_POINT'
  | 'CONTEXT_NOT_FOUND'
  | 'CONTEXT_EXPIRED'
  | 'CONTEXT_IMMUTABLE'
  | 'BUILDING_NOT_IN_CONTEXT'
  | 'PNU_UNAVAILABLE'
  | 'INVALID_SPACE_DETAIL';

const HTTP_STATUS_BY_CODE: Record<SpaceAnalysisErrorCode, number> = {
  INVALID_COORDINATE: 400,
  OUT_OF_SERVICE_AREA: 422,
  NO_BUILDING_NEAR_POINT: 404,
  CONTEXT_NOT_FOUND: 404,
  CONTEXT_EXPIRED: 410,
  CONTEXT_IMMUTABLE: 409,
  BUILDING_NOT_IN_CONTEXT: 422,
  PNU_UNAVAILABLE: 422,
  INVALID_SPACE_DETAIL: 422,
};

export class SpaceAnalysisContextError extends Error {
  readonly status: number;

  constructor(
    readonly code: SpaceAnalysisErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'SpaceAnalysisContextError';
    this.status = HTTP_STATUS_BY_CODE[code];
  }
}

export function isSpaceAnalysisContextError(
  error: unknown,
): error is SpaceAnalysisContextError {
  return error instanceof SpaceAnalysisContextError;
}
