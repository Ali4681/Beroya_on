import { Controller, Get, Header, Param, Query, StreamableFile } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/auth/decorators';
import { ApiGoErrors } from '../../../common/dto/api-errors.decorator';
import { GoErrorCode as E } from '../../../common/errors/go-error-codes';
import type { AppConfig } from '../../../config/configuration';
import { PublicTrackingService } from './public-tracking.service';
import { parseTrackingLang, trackingPageHtml } from './tracking-page';

/** Path of the HTML page, served outside the API prefix (see bootstrap). */
export const TRACKING_PAGE_ROUTE = 't/:token';

@Public()
@ApiTags('Public')
@Controller()
export class PublicTrackingController {
  private readonly apiPrefix: string;

  constructor(
    private readonly tracking: PublicTrackingService,
    config: ConfigService,
  ) {
    this.apiPrefix = config.getOrThrow<AppConfig>('app').apiPrefix;
  }

  @Get('public/track/:token')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Driver tracking for a shared link (no login)',
    description:
      'Works while the ride is SEARCHING through IN_PROGRESS; afterwards 410 TRACKING_LINK_EXPIRED. ' +
      'Unknown token → 404. Never returns phone numbers.',
  })
  @ApiGoErrors(E.NOT_FOUND, E.TRACKING_LINK_EXPIRED)
  view(@Param('token') token: string) {
    return this.tracking.view(token);
  }

  @Get('public/track/:token/driver-avatar')
  @Header('Cache-Control', 'private, max-age=300')
  @ApiOperation({ summary: 'Driver photo for a shared tracking link; stops with the link' })
  @ApiGoErrors(E.NOT_FOUND, E.TRACKING_LINK_EXPIRED)
  async avatar(@Param('token') token: string) {
    const file = await this.tracking.driverAvatar(token);
    return new StreamableFile(file.data, { type: file.mime, disposition: 'inline' });
  }

  /**
   * Temporary HTML fallback on the API host (`/t/:token`).
   * Production tracking UI lives on the website (`APP_PUBLIC_URL/t/:token`); keep this for
   * direct API-host hits until the front is fully cut over.
   */
  @Get(TRACKING_PAGE_ROUTE)
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  @ApiOperation({
    summary: 'Tracking HTML fallback (API host only); production UI is on the website',
    description:
      'Prefer APP_PUBLIC_URL/t/:token (Next). This Nest HTML page remains a temporary fallback. ' +
      'Language: ?lang=en|ar, otherwise the booking customer preferred_language (default AR).',
  })
  async pageHtml(@Param('token') token: string, @Query('lang') lang?: string) {
    const fromQuery = parseTrackingLang(lang);
    const resolved = fromQuery ?? (await this.tracking.pageLanguage(token));
    return trackingPageHtml(this.apiPrefix, resolved);
  }
}
