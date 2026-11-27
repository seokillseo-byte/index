import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('health')
@Controller('health')
export class HealthController {
  @Get('live')
  @ApiOperation({ summary: 'Process liveness probe' })
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe; returns 503 until dependencies are wired' })
  ready(): never {
    // Never advertise readiness while the database and event broker are not
    // connected and checked with bounded timeouts.
    throw new ServiceUnavailableException({
      status: 'not_ready',
      checks: { database: 'pending-integration', broker: 'pending-integration' },
    });
  }
}
