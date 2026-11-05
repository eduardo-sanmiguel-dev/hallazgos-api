import { classifyMailError, retryDelay } from './mail-policy.js';
import { encryptionKey, seal, unseal } from './mail-payload.js';

describe('Persistent mail policy', () => {
  it.each([
    [
      {
        responseCode: 554,
        response:
          'STOREDRV.Submission.Exception:QuotaExceededException.MapiExceptionStorageOverQuotaLimitExceeded',
      },
      'blocked',
      'sender_quota',
    ],
    [{ responseCode: 535, code: 'EAUTH' }, 'blocked', 'authentication'],
    [
      { responseCode: 550, response: '5.7.60 SendAsDenied' },
      'blocked',
      'authentication',
    ],
    [{ responseCode: 451 }, 'retry_wait', 'smtp_temporary'],
    [
      { responseCode: 554, response: '5.2.2 Mailbox full STOREDRV.Deliver' },
      'retry_wait',
      'recipient_quota',
    ],
    [
      { responseCode: 550, response: '5.1.1 User not found' },
      'dead',
      'smtp_permanent',
    ],
    [{ code: 'EDNS' }, 'retry_wait', 'connection'],
    [{ code: 'ESOCKET', command: 'CONN' }, 'retry_wait', 'connection'],
    [
      { code: 'ETIMEDOUT', command: 'DATA' },
      'uncertain',
      'smtp_result_unknown',
    ],
    [{ code: 'ECONNECTION' }, 'uncertain', 'smtp_result_unknown'],
    [new Error('missing attachment'), 'dead', 'content_or_configuration'],
  ])('classifies %j', (error, status, category) => {
    expect(classifyMailError(error)).toEqual({ status, category });
  });
  it('uses bounded increasing retry delays with jitter', () => {
    expect(retryDelay(1, () => 0)).toBe(48000);
    expect(retryDelay(8, () => 1)).toBeCloseTo(240 * 60000 * 1.2);
  });
  it('encrypts payloads and rejects tampering or a different key', () => {
    const key = encryptionKey('test-only-key');
    const data = { html: 'secret-token', recipient: 'private@example.test' };
    const encrypted = seal(data, key);
    expect(encrypted).not.toContain('secret-token');
    expect(unseal(encrypted, key)).toEqual(data);
    expect(() => unseal(encrypted, encryptionKey('wrong'))).toThrow();
    expect(() => encryptionKey('')).toThrow();
  });
});
