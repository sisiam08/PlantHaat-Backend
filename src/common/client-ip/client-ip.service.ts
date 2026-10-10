import { Injectable } from "@nestjs/common";
import type { IncomingHttpHeaders } from "node:http";

import { AppConfigService } from "../../config/app-config.service";
import { resolveClientIp } from "./client-ip";

@Injectable()
export class ClientIpService {
  constructor(private readonly config: AppConfigService) {}

  resolve(headers: IncomingHttpHeaders, fallback?: string): string {
    return resolveClientIp({
      headers,
      fallback,
      secret: this.config.values.BFF_SHARED_SECRET,
    });
  }
}
