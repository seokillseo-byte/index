import {ServiceUnavailableException} from '@nestjs/common';
import {HealthController} from '../src/health/health.controller';

describe('HealthController readiness dependencies',()=>{
  it('reports database and Redis readiness',async()=>{
    const db={query:jest.fn().mockResolvedValue({rows:[{ok:1}]})};
    const throttling={checkHealth:jest.fn().mockResolvedValue(undefined)};
    const controller=new HealthController(db as never,throttling as never);
    await expect(controller.ready()).resolves.toEqual({
      status:'ready',checks:{database:'ok',redis:'ok'},
    });
    expect(db.query).toHaveBeenCalledWith('SELECT 1');
    expect(throttling.checkHealth).toHaveBeenCalledTimes(1);
  });

  it('marks the API not ready when Redis is unavailable',async()=>{
    const db={query:jest.fn().mockResolvedValue({rows:[{ok:1}]})};
    const throttling={checkHealth:jest.fn().mockRejectedValue(new ServiceUnavailableException())};
    const controller=new HealthController(db as never,throttling as never);
    await expect(controller.ready()).rejects.toMatchObject({
      status:503,
      response:{status:'not_ready',checks:{database:'ok',redis:'unavailable'}},
    });
  });
});
