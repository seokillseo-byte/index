import {randomUUID} from 'node:crypto';
import {RedisThrottlerStorage} from '../src/throttling/redis-throttler.storage';

const integration = process.env.REDIS_TEST_URL ? describe : describe.skip;

integration('RedisThrottlerStorage Redis integration',()=>{
  it('shares counters and block state across independent API storage instances',async()=>{
    const url=process.env.REDIS_TEST_URL!;
    const first=new RedisThrottlerStorage(url);
    const second=new RedisThrottlerStorage(url);
    const key=`integration-${randomUUID()}`;
    try{
      await expect(first.increment(key,60000,1,30000,'integration')).resolves.toMatchObject({
        totalHits:1,isBlocked:false,
      });
      await expect(second.increment(key,60000,1,30000,'integration')).resolves.toMatchObject({
        totalHits:2,isBlocked:true,
      });
      await expect(first.increment(key,60000,1,30000,'integration')).resolves.toMatchObject({
        totalHits:2,isBlocked:true,
      });
    }finally{
      await first.close();
      await second.close();
    }
  });
});
