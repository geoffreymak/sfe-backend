import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';
import { setUserId } from '../common/logger/request-context';

type JwtUser = { sub?: string };

@Injectable()
// The dynamic mixin returned by AuthGuard('jwt') confuses type-aware lint
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext): boolean | Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    return super.canActivate(context) as boolean | Promise<boolean>;
  }

  handleRequest(
    err: unknown,
    user: JwtUser | false | null | undefined,
    info: unknown,
    context: ExecutionContext,
  ) {
    if (user && typeof user !== 'boolean' && 'sub' in user && user.sub) {
      setUserId(String(user.sub));
    }
    // Let AuthGuard handle errors by returning user or throwing
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return super.handleRequest(err, user, info, context);
  }
}
