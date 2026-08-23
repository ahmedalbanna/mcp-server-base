/**
 * Cluster mode for horizontal runtime scale (v3.0)
 * CLUSTER_MODE=true forks workers (CLUSTER_WORKERS or CPU count)
 * Each worker runs the HTTP server; stateless mode + RedisEventStore required for full scale
 */
import cluster from 'node:cluster';
import os from 'node:os';
import { config } from '../config.js';
import { logger } from './logger.js';

export function initCluster(startWorker: () => void): boolean {
  if (!config.cluster.enabled) return false;

  const workerCount =
    config.cluster.workers > 0
      ? config.cluster.workers
      : Math.max(1, os.availableParallelism() - 1);

  if (cluster.isPrimary) {
    logger.info(`Cluster primary starting ${workerCount} workers`, { pid: process.pid });
    for (let i = 0; i < workerCount; i++) {
      cluster.fork();
    }
    cluster.on('exit', (worker, code, signal) => {
      logger.warn('worker died, restarting', { pid: worker.process.pid, code, signal });
      cluster.fork();
    });
    return true; // primary does not run the server
  }

  // Worker
  logger.info('cluster worker started', { pid: process.pid });
  startWorker();
  return true;
}
