import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { SkipTenantGuard } from '../common/decorators/skip-tenant.decorator';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { AuthService } from './auth.service';
import { Request } from 'express';
import { JwtPayload } from './jwt.strategy';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return await this.authService.register(dto);
  }

  @Public()
  @Post('login')
  async login(@Body() dto: LoginDto) {
    return await this.authService.login(dto);
  }

  @ApiBearerAuth('bearer')
  @SkipTenantGuard()
  @Get('me')
  async me(@Req() req: Request & { user?: JwtPayload }) {
    const userId = req.user?.sub;
    if (!userId) throw new UnauthorizedException('Missing authenticated user');
    return await this.authService.me(userId);
  }
}
