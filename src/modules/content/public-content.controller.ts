import { Controller, Get, Headers, Res } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { createHash } from "node:crypto";
import type { Response } from "express";

import { Public } from "../../common/decorators/public.decorator";
import { ContentService } from "./content.service";

@Public()
@ApiTags("Home")
@Controller("home")
export class PublicContentController {
  constructor(private readonly content: ContentService) {}

  @Get("highlights")
  @ApiOperation({ summary: "Active home Highlights slides (public, cached)" })
  async highlights(
    @Res() response: Response,
    @Headers("if-none-match") ifNoneMatch?: string,
  ) {
    const data = await this.content.publicHighlights();
    const etag = `"${createHash("sha1").update(JSON.stringify(data)).digest("hex")}"`;
    response.setHeader("Cache-Control", "public, max-age=30, stale-while-revalidate=30");
    response.setHeader("ETag", etag);
    if (ifNoneMatch && ifNoneMatch === etag) {
      response.status(304).end();
      return;
    }
    response.status(200).json({ success: true, data });
  }
}
