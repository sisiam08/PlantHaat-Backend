import { Global, Module } from "@nestjs/common";

import { ClientIpService } from "./client-ip.service";

@Global()
@Module({
  providers: [ClientIpService],
  exports: [ClientIpService],
})
export class ClientIpModule {}
