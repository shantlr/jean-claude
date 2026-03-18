import { createFileRoute } from '@tanstack/react-router';

import { FeedNoteEditor } from '@/features/feed/ui-feed-note-editor';

export const Route = createFileRoute('/all/notes/$noteId')({
  component: AllNoteEditor,
});

function AllNoteEditor() {
  const { noteId } = Route.useParams();

  return <FeedNoteEditor noteId={noteId} />;
}
