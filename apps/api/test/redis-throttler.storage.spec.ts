import {ServiceUnavailableException} from '@nestjs/common';
import Redis = require('ioredis');
import {RedisThrottlerStorage} from '../src/throttling/redis-throttler.storage';

describe('RedisThrottlerStorage',()=>{
  it('uses one atomic Redis script and returns the shared counter state',async()=>{
    const client={
      status:'ready',
      eval:jest.fn().mockResolvedValue([4,42000,1,15000]),
      connect:jest.fn(),
      disconnect:jest.fn(),
    } as unknown as Redis;
    const storage=new RedisThrottlerStorage('redis://localhost:6379',client);
    await expect(storage.increment('client-key',60000,3,15000,'default')).resolves.toEqual({
      totalHits:4,timeToExpire:42000,isBlocked:true,timeToBlockExpire:15000,
    });
    expect(client.eval).toHaveBeenCalledTimes(1);
    const args=(client.eval as jest.Mock).mock.calls[0];
    expect(args[1]).toBe(2);
    expect(args[2]).toContain('index-assist:throttle:default:client-key:hits');
    expect(args[3]).toContain('index-assist:throttle:default:client-key:blocked');
    expect(args.slice(4)).toEqual(['60000','3','15000']);
  });

  it('connects lazily on first request',async()=>{
    const client={
      status:'wait',
      connect:jest.fn(async function(this:{status:string}){this.status='ready';}),
      eval:jest.fn().mockResolvedValue([1,60000,0,0]),
      disconnect:jest.fn(),
    } as unknown as Redis;
    const storage=new RedisThrottlerStorage('redis://localhost:6379',client);
    await storage.increment('key',60000,5,60000,'default');
    expect(client.connect).toHaveBeenCalledTimes(1);
  });

  it('fails closed with 503 when Redis is unavailable',async()=>{
    const client={
      status:'end',
      connect:jest.fn(),
      eval:jest.fn(),
      disconnect:jest.fn(),
    } as unknown as Redis;
    const storage=new RedisThrottlerStorage('redis://localhost:6379',client);
    await expect(storage.increment('key',60000,5,60000,'default'))
      .rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(client.eval).not.toHaveBeenCalled();
  });

  it('rejects missing Redis configuration',()=>{
    expect(()=>new RedisThrottlerStorage('')).toThrow('REDIS_URL is required');
  });
});
