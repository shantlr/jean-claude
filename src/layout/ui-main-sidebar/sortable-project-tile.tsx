import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { ProjectTile } from '@/features/project/ui-project-tile';

export function SortableProjectTile({
  id,
  name,
  color,
}: {
  id: string;
  name: string;
  color: string;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <ProjectTile id={id} name={name} color={color} />
    </div>
  );
}
