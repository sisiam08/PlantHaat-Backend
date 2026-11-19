import { Module } from "@nestjs/common";

import { UploadsModule } from "../uploads/uploads.module";
import { AdminReviewsController } from "./admin-reviews.controller";
import { ReviewsController } from "./reviews.controller";
import { ReviewsService } from "./reviews.service";
import { SellerReviewsController } from "./seller-reviews.controller";

@Module({
  imports: [UploadsModule],
  controllers: [ReviewsController, SellerReviewsController, AdminReviewsController],
  providers: [ReviewsService],
  exports: [ReviewsService],
})
export class ReviewsModule {}
