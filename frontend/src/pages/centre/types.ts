import type { ExamState } from '@sigil/ui';

export type CentrePageState = 'loading' | 'empty' | 'error' | 'permission' | 'ready';

export interface CentreExamAssignment {
  examId: string;
  title: string;
  state: ExamState;
  rosetteHash: string;
  releaseOpensAt: number;
  examStartsAt: number;
  examEndsAt: number;
  threshold: number;
}

export interface CentreAssignmentsViewProps {
  pageState: CentrePageState;
  assignments: readonly CentreExamAssignment[];
  error?: Error | null;
  onRetry?: () => void;
  paperRequestStatus?: Readonly<Record<string, { state: 'pending' | 'blocked'; message?: string }>>;
  onPaperRequest?: (examId: string, intent: 'generate' | 'reprint', reason?: string) => void;
}
