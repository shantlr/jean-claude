import clsx from 'clsx';
import { Check, X } from 'lucide-react';
import { useRef, useState } from 'react';

import type { ReviewerVoteStatus } from '@shared/azure-devops-types';

// Re-export the type for convenience
export type { ReviewerVoteStatus };

// Get initials from display name (up to 2 characters)
export function getInitials(displayName: string): string {
  const parts = displayName.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

type AvatarSize = 'sm' | 'md';

const SIZE_CLASSES: Record<AvatarSize, string> = {
  sm: 'h-5 w-5 text-[9px]',
  md: 'h-7 w-7 text-xs',
};

const BADGE_SIZE_CLASSES: Record<AvatarSize, string> = {
  sm: 'h-2.5 w-2.5',
  md: 'h-3 w-3',
};

const BADGE_ICON_CLASSES: Record<AvatarSize, string> = {
  sm: 'h-2 w-2',
  md: 'h-2 w-2',
};

// Border colors for the 'border' variant
const VOTE_BORDER_CLASSES: Record<ReviewerVoteStatus, string> = {
  approved: 'border-green-500',
  'approved-with-suggestions': 'border-green-400',
  waiting: 'border-yellow-500',
  rejected: 'border-red-500',
  none: 'border-glass-border',
};

// Human-readable labels for vote statuses
const VOTE_LABELS: Record<ReviewerVoteStatus, string> = {
  approved: 'Approved',
  'approved-with-suggestions': 'Approved with suggestions',
  waiting: 'Waiting for author',
  rejected: 'Rejected',
  none: 'No vote',
};

export function UserAvatar({
  name,
  title,
  imageUrl,
  size = 'sm',
  vote,
  variant = 'badge',
  highlight = false,
  className,
}: {
  name: string;
  /** Tooltip text. Defaults to name if not provided */
  title?: string;
  /** Optional avatar image URL */
  imageUrl?: string;
  size?: AvatarSize;
  vote?: ReviewerVoteStatus;
  /** 'badge' shows checkmark/X overlay, 'border' shows colored border */
  variant?: 'badge' | 'border';
  highlight?: boolean;
  className?: string;
}) {
  const [imgError, setImgError] = useState(false);
  const prevImageUrl = useRef(imageUrl);
  if (prevImageUrl.current !== imageUrl) {
    prevImageUrl.current = imageUrl;
    setImgError(false);
  }

  const isApproved =
    vote === 'approved' || vote === 'approved-with-suggestions';
  const isRejected = vote === 'rejected';

  const showBadge = variant === 'badge' && (isApproved || isRejected);
  const showBorder = variant === 'border' && vote;
  const showImage = imageUrl && !imgError;

  return (
    <div
      className={clsx(
        'relative flex shrink-0 items-center justify-center overflow-hidden rounded-full font-medium',
        SIZE_CLASSES[size],
        !showImage &&
          (highlight ? 'bg-acc text-ink-0' : 'bg-glass-medium text-ink-1'),
        showBorder && ['border-2', VOTE_BORDER_CLASSES[vote]],
        className,
      )}
      title={title ?? name}
    >
      {showImage ? (
        <img
          src={imageUrl}
          alt={name}
          className="h-full w-full object-cover"
          onError={() => setImgError(true)}
        />
      ) : (
        getInitials(name)
      )}

      {/* Vote indicator badge (for 'badge' variant) */}
      {showBadge && isApproved && (
        <div
          className={clsx(
            'absolute -right-0.5 -bottom-0.5 flex items-center justify-center rounded-full bg-green-600',
            BADGE_SIZE_CLASSES[size],
          )}
        >
          <Check
            className={clsx('text-ink-0', BADGE_ICON_CLASSES[size])}
            strokeWidth={3}
          />
        </div>
      )}
      {showBadge && isRejected && (
        <div
          className={clsx(
            'absolute -right-0.5 -bottom-0.5 flex items-center justify-center rounded-full bg-red-600',
            BADGE_SIZE_CLASSES[size],
          )}
        >
          <X
            className={clsx('text-ink-0', BADGE_ICON_CLASSES[size])}
            strokeWidth={3}
          />
        </div>
      )}
    </div>
  );
}

// Helper to get human-readable vote label
export function getVoteLabel(status: ReviewerVoteStatus): string {
  return VOTE_LABELS[status];
}
