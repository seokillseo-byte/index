import {OnModuleDestroy,ServiceUnavailableException} from '@nestjs/common';
import type {ThrottlerStorage} from '@nestjs/throttler';
import {Redis} from 'ioredis';

type ThrottlerStorageRecord = {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
};

const INCREMENT_SCRIPT = `
local blockedTtl = redis.call('PTTL', KEYS[2])
local current = tonumber(redis.call('GET', KEYS[1]) or '0')
if blockedTtl > 0 then
  return {current, redis.call('PTTL', KEYS[1]), 1, blockedTtl}
end
local hits = redis.call('INCR', KEYS[1])
if hits == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
if hits > tonumber(ARGV[2]) then
  redis.call('PSETEX', KEYS[2], ARGV[3], '1')
  return {hits, ttl, 1, tonumber(ARGV[3])}
end
return {hits, ttl, 0, 0}
`;

export class RedisThrottlerStorage implements ThrottlerStorage, OnModuleDestroy {
  private readonly redis: Redis;
  private connectPromise?: Promise<void>;

  constructor(redisUrl: string, redisClient?: Redis) {
    if (!redisUrl) throw new Error('REDIS_URL is required for shared API rate limiting');
    this.redis = redisClient ?? new Redis(redisUrl, {
      lazyConnect: true,
      connectTimeout: 2000,
      commandTimeout: 2000,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: () => null,
    });
  }

  private async ensureConnected(): Promise<void> {
    if (this.redis.status === 'wait') {
      this.connectPromise ??= this.redis.connect().finally(() => { this.connectPromise = undefined; });
    }
    if (this.connectPromise) await this.connectPromise;
    if (this.redis.status !== 'ready') throw new Error('Redis is not ready');
  }

  async checkHealth(): Promise<void> {
    try {
      await this.ensureConnected();
      if (await this.redis.ping() !== 'PONG') throw new Error('Redis health check failed');
    } catch {
      throw new ServiceUnavailableException('Shared rate-limiting service is unavailable');
    }
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    try {
      await this.ensureConnected();
      const prefix = `index-assist:throttle:${throttlerName}:${key}`;
      const blockMs = Math.max(1, blockDuration || ttl);
      const result = await this.redis.eval(
        INCREMENT_SCRIPT,
        2,
        `${prefix}:hits`,
        `${prefix}:blocked`,
        String(Math.max(1, ttl)),
        String(Math.max(1, limit)),
        String(blockMs),
      ) as [number, number, number, number];
      return {
        totalHits: Number(result[0]),
        timeToExpire: Math.max(0, Number(result[1])),
        isBlocked: Number(result[2]) === 1,
        timeToBlockExpire: Math.max(0, Number(result[3])),
      };
    } catch {
      // Fail closed: never silently fall back to per-process rate limits.
      throw new ServiceUnavailableException('Shared rate-limiting service is unavailable');
    }
  }

  onModuleDestroy(): void {
    this.redis.disconnect();
  }

  async close(): Promise<void> {
    this.redis.disconnect();
  }
}
