import { Send } from 'lucide-react';
import type { FormEvent, ChangeEvent } from 'react';
import { useState } from 'react';

export function PrCommentForm({
  onSubmit,
  isSubmitting,
  placeholder = 'Add a comment...',
}: {
  onSubmit: (content: string) => void;
  isSubmitting?: boolean;
  placeholder?: string;
}) {
  const [content, setContent] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (content.trim() && !isSubmitting) {
      onSubmit(content.trim());
      setContent('');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <textarea
        value={content}
        onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setContent(e.target.value)}
        placeholder={placeholder}
        className="flex-1 resize-none rounded-lg bg-neutral-800 px-3 py-2 text-sm text-neutral-200 placeholder-neutral-500 outline-none focus:ring-1 focus:ring-blue-500"
        rows={2}
        disabled={isSubmitting}
      />
      <button
        type="submit"
        disabled={!content.trim() || isSubmitting}
        className="flex items-center gap-1 self-end rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Send className="h-4 w-4" aria-hidden />
        {isSubmitting ? 'Sending…' : 'Send'}
      </button>
    </form>
  );
}
