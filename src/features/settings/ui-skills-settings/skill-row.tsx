import type { ReactNode } from 'react';
import { Wand2 } from 'lucide-react';


import {
  ListGroupHeader,
  ListItemButton,
} from '@/common/ui/list-detail-layout';

export function SkillRow({
  label,
  isActive,
  isEnabled = true,
  suffix,
  onClick,
}: {
  label: string;
  isActive: boolean;
  isEnabled?: boolean;
  suffix?: ReactNode;
  onClick: () => void;
}) {
  return (
    <ListItemButton
      label={label}
      isActive={isActive}
      isDimmed={!isEnabled}
      size="compact"
      onClick={onClick}
      renderIcon={({ isActive: active, isDimmed }) => (
        <Wand2
          size={14}
          className="shrink-0"
          style={{
            color: isDimmed
              ? 'oklch(0.4 0.01 280)'
              : active
                ? 'oklch(0.78 0.18 295)'
                : 'oklch(0.78 0.16 295)',
          }}
        />
      )}
      suffix={suffix}
    />
  );
}

export function GroupHeader({
  label,
  accent,
}: {
  label: string;
  accent?: boolean;
}) {
  return <ListGroupHeader label={label} accent={accent} />;
}
