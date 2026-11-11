import { Queue } from 'bullmq';

export class QueueHealthService {
  constructor(
    private readonly queues: Queue[],
    private readonly mock = false,
  ) {}

  get names(): string[] {
    return this.queues.map((q) => q.name);
  }

  async isHealthy(timeoutMs = 1000): Promise<boolean> {
    if (this.mock) return true;
    const probe = (async () => {
      const client = (await this.queues[0].client) as unknown as { ping(): Promise<string> };
      return (await client.ping()) === 'PONG';
    })();
    const timeout = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), timeoutMs));
    return Promise.race([probe.catch(() => false), timeout]);
  }
}
