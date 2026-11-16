import React from 'react';

export interface EmptyStateProps {
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  action,
  className = '',
}) => {
  return (
    <div className={`sigil-empty-state ${className}`.trim()} aria-live="polite" aria-atomic="true">
      <div className="sigil-empty-state__title" role="heading" aria-level={2}>{title}</div>
      <p className="sigil-empty-state__description">{description}</p>
      {action && <div>{action}</div>}
    </div>
  );
};
