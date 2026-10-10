import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Public } from "../../common/decorators/public.decorator";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { AppConfigService } from "../../config/app-config.service";
import { UsersService } from "../users/users.service";
import {
  clearAuthCookies,
  readRefreshCookie,
  setAccessCookie,
  setAuthCookies,
  setRefreshCookie,
} from "./auth.cookies";
import { AuthService, type SessionMeta } from "./auth.service";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { LoginDto } from "./dto/login.dto";
import { RegisterSellerDto } from "./dto/register-seller.dto";
import { RegisterDto } from "./dto/register.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";
import { VerifyEmailDto } from "./dto/verify-email.dto";

const HOUR_MS = 60 * 60 * 1000;

function toSessionMeta(request: Request): SessionMeta {
  const userAgent = request.headers["user-agent"];
  const clientIp = (request as Request & { clientIp?: string }).clientIp;
  return {
    userAgent: typeof userAgent === "string" ? userAgent : undefined,
    ipAddress: clientIp ?? request.ip,
  };
}

@ApiTags("Auth")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
    private readonly config: AppConfigService,
  ) {}

  @Public()
  @Post("register")
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 5, ttl: HOUR_MS } })
  @ApiOperation({ summary: "Register a customer account" })
  async register(
    @Body() dto: RegisterDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.register(dto, toSessionMeta(request));
    setAuthCookies(response, this.config, result.tokens);
    return { user: result.user, accessTokenExpiresAt: result.tokens.accessTokenExpiresAt };
  }

  @Public()
  @Post("register/seller")
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 5, ttl: HOUR_MS } })
  @ApiOperation({ summary: "Register a seller account (creates a draft seller profile)" })
  async registerSeller(
    @Body() dto: RegisterSellerDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.registerSeller(dto, toSessionMeta(request));
    setAuthCookies(response, this.config, result.tokens);
    return { user: result.user, accessTokenExpiresAt: result.tokens.accessTokenExpiresAt };
  }

  @Public()
  @Post("login")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60 * 1000 } })
  @ApiOperation({ summary: "Log in and set the auth cookies" })
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.login(dto, toSessionMeta(request));
    setAuthCookies(response, this.config, result.tokens);
    return { user: result.user, accessTokenExpiresAt: result.tokens.accessTokenExpiresAt };
  }

  @Public()
  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60 * 1000 } })
  @ApiOperation({ summary: "Rotate the refresh token and issue a new access token" })
  async refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    try {
      const result = await this.auth.refresh(readRefreshCookie(request), toSessionMeta(request));
      setAccessCookie(response, this.config, result.accessToken);
      if (result.refreshToken) {
        setRefreshCookie(response, this.config, result.refreshToken);
      }
      return { user: result.user, accessTokenExpiresAt: result.accessTokenExpiresAt };
    } catch (error) {
      clearAuthCookies(response, this.config);
      throw error;
    }
  }

  @Public()
  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Revoke the current session family and clear cookies" })
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    await this.auth.logout(readRefreshCookie(request));
    clearAuthCookies(response, this.config);
  }

  @Post("logout-all")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Revoke all sessions of the current user" })
  async logoutAll(@CurrentUser("id") userId: string) {
    await this.auth.logoutAll(userId);
  }

  @Get("me")
  @ApiOperation({ summary: "Get the current user (used to bootstrap the frontend)" })
  getMe(@CurrentUser("id") userId: string) {
    return this.users.getProfile(userId);
  }

  @Get("sessions")
  @ApiOperation({ summary: "List active sessions for the current user" })
  listSessions(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.listSessions(user.id, user.sessionId);
  }

  @Delete("sessions/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Revoke one of the current user's sessions" })
  async deleteSession(@CurrentUser() user: AuthenticatedUser, @Param("id") sessionId: string) {
    await this.auth.revokeSessionForUser(user.id, sessionId);
  }

  @Public()
  @Post("verify-email")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Verify an email address with a token" })
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.auth.verifyEmail(dto.token);
  }

  @Post("resend-verification")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: HOUR_MS } })
  @ApiOperation({ summary: "Resend the verification email" })
  resendVerification(@CurrentUser("id") userId: string) {
    return this.auth.resendVerification(userId);
  }

  @Public()
  @Post("forgot-password")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: HOUR_MS } })
  @ApiOperation({ summary: "Request a password reset email (always succeeds)" })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.auth.forgotPassword(dto.email);
  }

  @Public()
  @Post("reset-password")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Reset the password with a token and revoke all sessions" })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto.token, dto.newPassword);
  }

  @Post("change-password")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Change the current user's password and revoke other sessions" })
  changePassword(@CurrentUser() user: AuthenticatedUser, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(user.id, user.sessionId, dto);
  }
}
