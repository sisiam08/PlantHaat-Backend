import { Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";

import { PrismaClient } from "../generated/prisma/client";
import { createPrismaOptions } from "./prisma-client";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super(createPrismaOptions());
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
