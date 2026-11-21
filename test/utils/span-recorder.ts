import {
  type Attributes,
  type AttributeValue,
  type Span,
  type SpanStatus,
  trace,
  type Tracer,
  type TracerProvider,
} from '@opentelemetry/api';

export type RecordedSpan = {
  name: string;
  attributes: Attributes;
  status?: SpanStatus;
  exceptions: unknown[];
  ended: boolean;
};

/**
 * Tracer de prueba: registra los spans que crea `traced` (src/shared/tracing)
 * sin el SDK de OpenTelemetry. `install()` en beforeAll y `uninstall()` en
 * afterAll; `reset()` entre casos.
 */
export const spanRecorder = () => {
  const spans: RecordedSpan[] = [];

  const startActiveSpan = (
    name: string,
    options: { attributes?: Attributes },
    work: (span: Span) => unknown,
  ) => {
    const recorded: RecordedSpan = {
      name,
      attributes: { ...options.attributes },
      exceptions: [],
      ended: false,
    };
    spans.push(recorded);
    const span = {
      setAttribute(key: string, value: AttributeValue) {
        recorded.attributes[key] = value;
        return span;
      },
      setStatus(status: SpanStatus) {
        recorded.status = status;
        return span;
      },
      recordException(exception: unknown) {
        recorded.exceptions.push(exception);
      },
      end() {
        recorded.ended = true;
      },
    } as unknown as Span;
    return work(span);
  };

  const provider: TracerProvider = {
    getTracer: () => ({ startActiveSpan }) as unknown as Tracer,
  };

  return {
    spans,
    install: () => trace.setGlobalTracerProvider(provider),
    uninstall: () => trace.disable(),
    reset: () => spans.splice(0),
  };
};
