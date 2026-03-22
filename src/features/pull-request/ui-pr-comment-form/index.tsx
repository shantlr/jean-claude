import { Send } from 'lucide-react';
import type { FormEvent, ChangeEvent } from 'react';
import { useState } from 'react';

import { Button } from '@/common/ui/button';
import { Textarea } from '@/common/ui/textarea';

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
      <Textarea
        value={content}
        onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
          setContent(e.target.value)
        }
        placeholder={placeholder}
        className="flex-1"
        rows={2}
        disabled={isSubmitting}
      />
      <Button
        type="submit"
        variant="primary"
        size="md"
        disabled={!content.trim() || isSubmitting}
        icon={<Send />}
        className="self-end"
      >
        {isSubmitting ? 'Sending…' : 'Send'}
      </Button>
    </form>
  );
}
