import test from 'node:test';
import assert from 'node:assert/strict';
import {googleQuotaDeferral} from '../src/provider-quota.mjs';

const dayStart = new Date('2026-11-28T00:00:00.000Z');

test('allows an attempt while daily and rolling-minute quotas have capacity', () => {
  assert.equal(googleQuotaDeferral({
    lastAttemptAt: null,
    dailyUsed: 12,
    minuteUsed: 2,
    dailyLimit: 2000,
    minuteLimit: 600,
    dayStart,
  }), null);
});

test('defers when the rolling 60-second attempt quota is exhausted', () => {
  assert.equal(googleQuotaDeferral({
    lastAttemptAt: null,
    dailyUsed: 12,
    minuteUsed: 600,
    dailyLimit: 2000,
    minuteLimit: 600,
    dayStart,
  }), 'minute');
});

test('defers when the daily attempt quota is exhausted', () => {
  assert.equal(googleQuotaDeferral({
    lastAttemptAt: null,
    dailyUsed: 2000,
    minuteUsed: 10,
    dailyLimit: 2000,
    minuteLimit: 600,
    dayStart,
  }), 'daily');
});

test('does not retry the same inspection job again in the same UTC day', () => {
  assert.equal(googleQuotaDeferral({
    lastAttemptAt: new Date('2026-11-28T09:00:00.000Z'),
    dailyUsed: 1,
    minuteUsed: 0,
    dailyLimit: 2000,
    minuteLimit: 600,
    dayStart,
  }), 'daily');
});

test('allows a job whose previous attempt was on an earlier UTC day', () => {
  assert.equal(googleQuotaDeferral({
    lastAttemptAt: new Date('2026-11-27T23:59:59.000Z'),
    dailyUsed: 10,
    minuteUsed: 1,
    dailyLimit: 2000,
    minuteLimit: 600,
    dayStart,
  }), null);
});
