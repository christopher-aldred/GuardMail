/**
 * Redis-backed email queue for async processing.
 */
import 'dotenv/config';
import Redis from 'ioredis';
import type { EmailQueueMessage } from '@guardmail/shared';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const QUEUE_KEY = 'guardmail:email-queue';
const PROCESSING_KEY = 'guardmail:email-queue:processing';

export const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
});

export const emailQueue = {
  async enqueue(msg: EmailQueueMessage): Promise<void> {
    await redis.rpush(QUEUE_KEY, JSON.stringify(msg));
  },

  async dequeue(timeoutMs = 5_000): Promise<EmailQueueMessage | null> {
    const result = (await redis.blpop(QUEUE_KEY, Math.ceil(timeoutMs / 1000))) as
      | [string, string]
      | null;
    if (!result) return null;
    return JSON.parse(result[1]) as EmailQueueMessage;
  },

  async length(): Promise<number> {
    return redis.llen(QUEUE_KEY);
  },

  async clear(): Promise<void> {
    await redis.del(QUEUE_KEY, PROCESSING_KEY);
  },
};

export async function closeRedis(): Promise<void> {
  await redis.quit();
}