export type MailStatus = 'retry_wait' | 'blocked' | 'dead' | 'uncertain';

/** Conservative: an interrupted DATA exchange may already have been accepted. */
export function classifyMailError(error: unknown): {
  status: MailStatus;
  category: string;
} {
  const e = error as {
    code?: string;
    responseCode?: number;
    command?: string;
    response?: string;
    message?: string;
  };
  const text = `${e.response ?? ''} ${e.message ?? ''}`;
  if (
    /STOREDRV\.Submission/i.test(text) &&
    /StorageOverQuota|QuotaExceeded|Mailbox full/i.test(text)
  )
    return { status: 'blocked', category: 'sender_quota' };
  if (
    e.responseCode === 535 ||
    e.code === 'EAUTH' ||
    /SendAsDenied|5\.7\./i.test(text)
  )
    return { status: 'blocked', category: 'authentication' };
  if (
    !e.responseCode &&
    (e.command === 'DATA' ||
      (['ETIMEDOUT', 'ESOCKET', 'ECONNECTION'].includes(e.code ?? '') &&
        !e.command))
  )
    return { status: 'uncertain', category: 'smtp_result_unknown' };
  if (e.responseCode >= 400 && e.responseCode < 500)
    return { status: 'retry_wait', category: 'smtp_temporary' };
  if (
    e.code === 'EDNS' ||
    e.code === 'ECONNREFUSED' ||
    e.code === 'ECONNECTION' ||
    e.code === 'ETIMEDOUT' ||
    e.code === 'ESOCKET'
  )
    return { status: 'retry_wait', category: 'connection' };
  if (/5\.2\.2|Mailbox full/i.test(text))
    return { status: 'retry_wait', category: 'recipient_quota' };
  return {
    status: 'dead',
    category: e.responseCode ? 'smtp_permanent' : 'content_or_configuration',
  };
}

export function retryDelay(attempt: number, random = Math.random): number {
  const minutes = [1, 5, 15, 30, 60, 120, 240];
  return (
    minutes[Math.min(Math.max(attempt - 1, 0), 6)] *
    60_000 *
    (0.8 + random() * 0.4)
  );
}
