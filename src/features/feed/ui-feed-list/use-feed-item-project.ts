import {
  useProjectFeedPriority,
  useProjectLogoFields,
} from '@/hooks/use-projects';
import type { FeedItem } from '@shared/feed-types';

export function useFeedItemProject(item: FeedItem) {
  const projectId = item.source === 'note' ? '' : item.projectId;
  const project = useProjectLogoFields(projectId);
  const projectPriority = useProjectFeedPriority(projectId, item.source);

  if (item.source === 'note') {
    return {
      name: 'Notes',
      color: 'var(--color-ink-3)',
      logoPath: null,
      priority: item.projectPriority,
    };
  }

  return {
    name: project.name ?? item.projectName,
    color: project.color ?? item.projectColor,
    logoPath: project.logoPath ?? item.projectLogoPath ?? null,
    priority: projectPriority ?? item.projectPriority,
  };
}
