export interface DocketExam {
  examId: string;
  serialSort: string;
  chainId: number;
  state: number;
  metaHash: string;
  releaseOpensAt: string;
  examStartsAt: string;
  examEndsAt: string;
  threshold: number;
  bankHash: string | null;
  title: string | null;
  holderCount: number;
}
