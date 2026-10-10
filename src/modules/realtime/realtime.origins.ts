let allowedOrigins: string[] = [];

export function setRealtimeAllowedOrigins(origins: string[]): void {
  allowedOrigins = origins;
}

export function isRealtimeOriginAllowed(origin: string | undefined): boolean {
  return !origin || allowedOrigins.includes(origin);
}
