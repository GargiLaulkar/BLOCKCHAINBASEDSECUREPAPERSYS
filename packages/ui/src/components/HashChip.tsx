import React, { useState } from 'react';
import { Tooltip } from './Tooltip';

export interface HashChipProps {
  hash: string;
  leadLength?: number;
  tailLength?: number;
  txUrl?: string;
  className?: string;
}

export const HashChip: React.FC<HashChipProps> = ({
  hash,
  leadLength = 6,
  tailLength = 4,
  txUrl,
  className = '',
}) => {
  const [copied, setCopied] = useState(false);

  const truncated = React.useMemo(() => {
    if (!hash) return '';
    if (hash.length <= leadLength + tailLength + 3) return hash;
    return `${hash.slice(0, leadLength)}...${hash.slice(-tailLength)}`;
  }, [hash, leadLength, tailLength]);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!hash) return;
    try {
      await navigator.clipboard.writeText(hash);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  const chipContent = (
    <span
      className={`sigil-hash-chip ${className}`.trim()}
      onClick={handleCopy}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          void handleCopy(e as unknown as React.MouseEvent);
        }
      }}
      aria-label={`Hash ${hash}. Click to copy.`}
    >
      <span>{truncated}</span>
      <span className="sigil-hash-chip__copy-icon" aria-hidden="true">
        {copied ? '✓' : '⧉'}
      </span>
      {txUrl && (
        <a
          href={txUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          aria-label="View transaction details"
          style={{ textDecoration: 'none', marginLeft: '2px' }}
        >
          ↗
        </a>
      )}
    </span>
  );

  return (
    <Tooltip content={copied ? 'Copied full hash!' : hash}>
      {chipContent}
    </Tooltip>
  );
};
