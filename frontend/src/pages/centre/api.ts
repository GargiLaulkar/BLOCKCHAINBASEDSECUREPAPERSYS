export type CentrePaperIntent = 'generate' | 'reprint';

const apiOrigin = import.meta.env.VITE_API_ORIGIN ?? 'http://localhost:4000';

export async function requestCentrePaper(
  examId: string,
  intent: CentrePaperIntent,
  reason?: string,
): Promise<void> {
  const response = await fetch(
    `${apiOrigin}/api/exams/${encodeURIComponent(examId)}/centre-paper/request`,
    {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ intent, ...(reason ? { reason } : {}) }),
    },
  );
  if (response.ok) return;

  let code = '';
  try {
    const payload: unknown = await response.json();
    if (typeof payload === 'object' && payload !== null && 'error' in payload) {
      const error = (payload as { error?: { code?: unknown } }).error;
      if (typeof error?.code === 'string') code = error.code;
    }
  } catch {
    // Return only a fixed, non-secret message below.
  }

  const messages: Record<string, string> = {
    CENTRE_NOT_ASSIGNED: 'This Centre is not assigned to the examination.',
    EXAM_NOT_RELEASED: 'Paper access is unavailable until the exam is released.',
    PRINT_WINDOW_CLOSED: 'The Centre paper window is not open.',
    PROTECTED_PRINT_SERVICE_UNAVAILABLE:
      'Paper generation is pending configuration of the protected release, attestation, and managed print services.',
    EXAM_VALIDATION_UNAVAILABLE: 'Centre assignment could not be verified. Retry later.',
  };
  throw new Error(messages[code] ?? 'The Centre paper request could not be completed.');
}
