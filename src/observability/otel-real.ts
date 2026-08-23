/**
 * OTEL Real SDK wrapper (Phase 5 next - v2.1)
 * Feature-flagged: if @opentelemetry deps not installed or OTEL_ENABLED=false, falls back to stub in src/utils/otel.ts
 * Usage:
 *   import { initOtel } from './observability/otel-real.js';
 *   await initOtel(); // call once at startup when OTEL_ENABLED=true
 */
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

export async function initOtel(): Promise<{ shutdown: () => Promise<void> } | null> {
  if (!config.otel.enabled) {
    logger.info('OTEL real disabled (OTEL_ENABLED=false) - using stub');
    return null;
  }

  try {
    // Dynamic import so base doesn't hard-depend on OTEL packages
    const { NodeSDK } = await import('@opentelemetry/sdk-node' as any);
    const { ConsoleSpanExporter } = await import('@opentelemetry/sdk-trace-base' as any);
    const { getNodeAutoInstrumentations } = await import(
      '@opentelemetry/auto-instrumentations-node' as any
    );

    let traceExporter: any = new ConsoleSpanExporter();
    if (config.otel.endpoint) {
      try {
        const { OTLPTraceExporter } = await import(
          '@opentelemetry/exporter-trace-otlp-http' as any
        );
        traceExporter = new OTLPTraceExporter({ url: config.otel.endpoint });
        logger.info('OTEL OTLP exporter enabled', { endpoint: config.otel.endpoint });
      } catch {
        logger.warn('OTLP exporter not available, using ConsoleSpanExporter');
      }
    }

    const sdk = new NodeSDK({
      traceExporter,
      instrumentations: [getNodeAutoInstrumentations()],
      serviceName: config.server.name,
    });

    await sdk.start();
    logger.info('OTEL SDK started', {
      service: config.server.name,
      version: config.server.version,
    });

    const shutdown = async () => {
      await sdk.shutdown();
      logger.info('OTEL SDK shutdown');
    };
    process.on('SIGTERM', shutdown);
    return { shutdown };
  } catch (err) {
    logger.warn('OTEL real init failed (deps not installed?), falling back to stub', {
      error: String(err),
    });
    logger.info(
      'Hint: npm install @opentelemetry/sdk-node @opentelemetry/api @opentelemetry/exporter-trace-otlp-http @opentelemetry/auto-instrumentations-node'
    );
    return null;
  }
}
