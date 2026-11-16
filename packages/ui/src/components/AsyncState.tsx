import React from 'react';
import { Button } from './Button';

export interface LoadingStateProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  children?: React.ReactNode;
}

export function LoadingState({ label, className = '', children, ...props }: LoadingStateProps) {
  return <div className={`sigil-loading-state ${className}`.trim()} role="status" aria-live="polite" aria-busy="true" {...props}>
    <span className="sigil-loading-state__indicator" aria-hidden="true" />
    <span>{label}</span>
    {children}
  </div>;
}

export interface ErrorStateProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}

export function ErrorState({ title = 'Something went wrong', message, onRetry, retryLabel = 'Retry', className = '', ...props }: ErrorStateProps) {
  return <section className={`sigil-error-state ${className}`.trim()} role="alert" aria-live="assertive" {...props}>
    <h2 className="sigil-error-state__title">{title}</h2>
    <p>{message}</p>
    {onRetry && <Button variant="secondary" onClick={onRetry}>{retryLabel}</Button>}
  </section>;
}

export interface SuccessMessageProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function SuccessMessage({ className = '', children, ...props }: SuccessMessageProps) {
  return <div className={`sigil-success-message ${className}`.trim()} role="status" aria-live="polite" aria-atomic="true" {...props}>{children}</div>;
}
