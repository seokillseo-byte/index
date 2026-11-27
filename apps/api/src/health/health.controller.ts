import { Controller, Get } from '@nestjs/common';
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
  @ApiOperation({ summary: 'Readiness probe; expanded as dependencies are wired' })
  ready(): { status: 'ready'; checks: Record<string, 'pending-integration'> } {
    // This endpoint intentionally does not claim DB/broker readiness until
    // their connection providers and timeout-bounded checks are registered.
    return { status: 'ready', checks: { database: 'pending-integration', broker: 'pending-integration' } };
  }
}
