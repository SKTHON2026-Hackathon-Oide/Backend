export interface BuildingHubPage {
  totalCount: number;
  items: Record<string, unknown>[];
  raw: unknown;
}

export class BuildingHubClientError extends Error {
  constructor(
    readonly code:
      | 'REGISTRY_TIMEOUT'
      | 'REGISTRY_HTTP_ERROR'
      | 'REGISTRY_INVALID_RESPONSE'
      | 'REGISTRY_AUTH_ERROR'
      | 'REGISTRY_CONFIGURATION_ERROR',
    message: string,
  ) {
    super(message);
    this.name = 'BuildingHubClientError';
  }
}
