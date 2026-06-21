import clsx from 'clsx';
import { useQuery } from '@tanstack/react-query';


import { api } from '@/lib/api';
import type { Project } from '@shared/types';

export function ProjectLogo({
  project,
  size = 'md',
  className,
}: {
  project: Pick<Project, 'name' | 'color' | 'logoPath'>;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const { data: logoUrl } = useQuery({
    queryKey: ['project-logo', project.logoPath],
    queryFn: () => api.fs.getImageUrl(project.logoPath ?? ''),
    enabled: !!project.logoPath,
    staleTime: Infinity,
  });

  const sizeClass =
    size === 'xs'
      ? 'h-4 w-4'
      : size === 'sm'
        ? 'h-5 w-5'
        : size === 'lg'
          ? 'h-16 w-16'
          : 'h-9 w-9';

  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={`${project.name} logo`}
        className={clsx(
          sizeClass,
          'rounded-xl border border-white/10 object-cover',
          className,
        )}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={clsx(
        sizeClass,
        'rounded-full border border-white/10',
        className,
      )}
      style={{ backgroundColor: project.color }}
    />
  );
}

export function ProjectLogoBackground({
  project,
  className,
  showColorFallback = false,
  size = 'md',
  fixedHeight = false,
}: {
  project: Pick<Project, 'name' | 'color' | 'logoPath'>;
  className?: string;
  showColorFallback?: boolean;
  size?: 'sm' | 'md';
  fixedHeight?: boolean;
}) {
  const { data: logoUrl } = useQuery({
    queryKey: ['project-logo', project.logoPath],
    queryFn: () => api.fs.getImageUrl(project.logoPath ?? ''),
    enabled: !!project.logoPath,
    staleTime: Infinity,
  });

  if (!logoUrl && !showColorFallback) return null;

  const maskGradient =
    size === 'sm'
      ? 'radial-gradient(circle at 65% 10%, rgba(0,0,0,1) 0%, rgba(0,0,0,0.85) 18%, rgba(0,0,0,0.35) 38%, rgba(0,0,0,0.0) 68%, rgba(0,0,0,0.0) 100%)'
      : 'radial-gradient(circle at 60% 10%, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.4) 15%, rgba(0,0,0,0.1) 30%, rgba(0,0,0,0.0) 55%, rgba(0,0,0,0.0) 100%)';

  const maskStyle = {
    maskImage: maskGradient,
    WebkitMaskImage: maskGradient,
  };

  const sizeClass =
    size === 'sm' ? 'w-14 translate-x-[42%]' : 'w-28 translate-x-[30%]';
  const heightClass = fixedHeight
    ? size === 'sm'
      ? 'top-0 h-7'
      : 'top-0 h-14'
    : 'top-0 bottom-0 h-full';
  const fallbackSizeClass =
    size === 'sm'
      ? 'top-0 h-14 w-14 translate-x-[42%]'
      : 'top-0 h-28 w-28 translate-x-[30%]';

  if (!logoUrl) {
    return (
      <div
        className={clsx(
          'pointer-events-none absolute right-0 saturate-125',
          fallbackSizeClass,
          className,
        )}
        style={{
          ...maskStyle,
          background: project.color,
        }}
      />
    );
  }

  return (
    <img
      src={logoUrl}
      alt=""
      className={clsx(
        'pointer-events-none absolute right-0 object-cover object-right saturate-125',
        heightClass,
        sizeClass,
        className,
      )}
      style={{
        ...maskStyle,
        borderRadius: 0,
      }}
    />
  );
}
