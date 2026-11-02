import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useExams } from '../../hooks/useExams';
import { useAuthGuard } from '../../auth/useAuthGuard';
import { DocketView } from './DocketView';

export const DocketContainer: React.FC = () => {
  const guard = useAuthGuard(['AUTHORITY']);
  const navigate = useNavigate();

  const [stateFilter, setStateFilter] = useState<string | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Live exams hook from Member 5
  const { exams, isLoading, error, refetch } = useExams({
    enabled: guard.isAuthorized,
  });

  const isPermissionDenied = guard.guardState === 'no-role';

  return (
    <DocketView
      exams={exams}
      isLoading={isLoading}
      error={error}
      permissionDenied={isPermissionDenied}
      stateFilter={stateFilter}
      onStateFilterChange={setStateFilter}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      onCreateExam={() => navigate('/exams/create')}
      onRowClick={(exam) => navigate(`/exams/${exam.examId}`)}
      onRetry={() => refetch()}
    />
  );
};
