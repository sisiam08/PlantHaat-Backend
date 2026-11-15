import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Public } from "../../common/decorators/public.decorator";
import { SettingsService } from "./settings.service";

@Public()
@ApiTags("Settings")
@Controller("settings")
export class PublicSettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get("public")
  @ApiOperation({ summary: "Whitelisted public settings" })
  getPublic() {
    return this.settings.getPublic();
  }
}
