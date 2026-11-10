import { EventEmitter } from 'node:events';
import { exitOnSignal } from './graceful-shutdown.js';

function fakeProcess() {
  const target = new EventEmitter() as EventEmitter & { exit: jest.Mock };
  target.exit = jest.fn();
  return target;
}
const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('exitOnSignal', () => {
  afterEach(() => jest.useRealTimers());

  it.each(['SIGTERM', 'SIGINT'])(
    'closes and exits with 0 on %s',
    async (signal) => {
      const target = fakeProcess();
      const close = jest.fn().mockResolvedValue(undefined);
      exitOnSignal(close, { target });
      target.emit(signal);
      await flush();
      expect(close).toHaveBeenCalledTimes(1);
      expect(target.exit).toHaveBeenCalledWith(0);
    },
  );

  it('exits with 1 when closing fails', async () => {
    const target = fakeProcess();
    exitOnSignal(() => Promise.reject(new Error('redis down')), { target });
    target.emit('SIGTERM');
    await flush();
    expect(target.exit).toHaveBeenCalledWith(1);
  });

  it('closes only once when signals repeat', async () => {
    const target = fakeProcess();
    const close = jest.fn().mockResolvedValue(undefined);
    exitOnSignal(close, { target });
    target.emit('SIGINT');
    target.emit('SIGTERM');
    target.emit('SIGINT');
    await flush();
    expect(close).toHaveBeenCalledTimes(1);
    expect(target.exit).toHaveBeenCalledTimes(1);
  });

  it('forces exit with 1 when closing hangs past the timeout', () => {
    jest.useFakeTimers();
    const target = fakeProcess();
    exitOnSignal(() => new Promise(() => {}), { target, timeoutMs: 5000 });
    target.emit('SIGTERM');
    jest.advanceTimersByTime(4999);
    expect(target.exit).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(target.exit).toHaveBeenCalledWith(1);
  });

  it('defaults the guard below the pm2 kill_timeout', () => {
    jest.useFakeTimers();
    const target = fakeProcess();
    exitOnSignal(() => new Promise(() => {}), { target });
    target.emit('SIGTERM');
    jest.advanceTimersByTime(90_000);
    expect(target.exit).toHaveBeenCalledWith(1);
  });
});
