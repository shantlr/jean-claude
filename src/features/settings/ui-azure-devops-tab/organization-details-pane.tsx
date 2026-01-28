import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  GitBranch,
  Loader2,
  Trash2,
  X,
} from 'lucide-react';
import { useState } from 'react';

import { useProviderDetails, useDeleteProvider } from '@/hooks/use-providers';
import type { ProviderProject, ProviderRepo } from '@/lib/api';

import type { Provider } from '../../../../shared/types';

import { DeleteProviderDialog } from './delete-provider-dialog';

function ProjectAccordion({
  project,
  repos,
}: {
  project: ProviderProject;
  repos: ProviderRepo[];
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-neutral-700 bg-neutral-800/30">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left hover:bg-neutral-700/50"
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-neutral-500" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-neutral-500" />
        )}
        <span className="flex-1 truncate text-sm font-medium text-neutral-200">
          {project.name}
        </span>
        <a
          href={project.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="shrink-0 rounded p-1 text-neutral-500 hover:bg-neutral-600 hover:text-neutral-300"
          title="Open project in browser"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </button>

      {isExpanded && (
        <div className="border-t border-neutral-700 px-3 py-2">
          {repos.length === 0 ? (
            <p className="py-1 text-xs text-neutral-500">No repositories</p>
          ) : (
            <div className="flex flex-col gap-1">
              {repos.map((repo) => (
                <div
                  key={repo.id}
                  className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-neutral-700/50"
                >
                  <GitBranch className="h-3.5 w-3.5 shrink-0 text-neutral-500" />
                  <span className="flex-1 truncate text-sm text-neutral-400">
                    {repo.name}
                  </span>
                  <a
                    href={repo.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 rounded p-1 text-neutral-500 hover:bg-neutral-600 hover:text-neutral-300"
                    title="Open repository in browser"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function OrganizationDetailsPane({
  provider,
  onClose,
}: {
  provider: Provider;
  onClose: () => void;
}) {
  const { data, isLoading, error } = useProviderDetails(provider.id);
  const deleteProvider = useDeleteProvider();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const handleDelete = () => {
    deleteProvider.mutate(provider.id, {
      onSuccess: () => {
        setShowDeleteDialog(false);
        onClose();
      },
    });
  };

  return (
    <>
      <DeleteProviderDialog
        isOpen={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        onConfirm={handleDelete}
        provider={provider}
        isPending={deleteProvider.isPending}
      />
      <div className="flex h-full w-96 shrink-0 flex-col rounded-lg border border-neutral-700 bg-neutral-800/50">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-700 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/20 text-blue-400">
              <svg
                className="h-3.5 w-3.5"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M0 8.877L2.247 5.91l8.405-3.416V.022l7.37 5.393L2.966 8.338v8.225L0 15.707zm24-4.45v14.651l-5.753 4.9-9.303-3.057v3.056l-5.978-7.416 15.057 1.798V5.415z" />
              </svg>
            </div>
            <div>
              <h3 className="font-medium text-neutral-200">{provider.label}</h3>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <a
              href={provider.baseUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-700 hover:text-neutral-300"
              title="Open organization in browser"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
            <button
              onClick={onClose}
              className="cursor-pointer rounded-lg p-2 text-neutral-500 hover:bg-neutral-700 hover:text-neutral-300"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-neutral-500" />
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-400">
              {error.message}
            </div>
          )}

          {data && (
            <div className="flex flex-col gap-2">
              <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-500">
                Projects ({data.projects.length})
              </h4>
              {data.projects.length === 0 ? (
                <p className="text-sm text-neutral-500">No projects found</p>
              ) : (
                data.projects.map(({ project, repos }) => (
                  <ProjectAccordion
                    key={project.id}
                    project={project}
                    repos={repos}
                  />
                ))
              )}
            </div>
          )}
        </div>

        {/* Footer with delete button */}
        <div className="border-t border-neutral-700 px-4 py-3">
          <button
            onClick={() => setShowDeleteDialog(true)}
            className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-500/20"
          >
            <Trash2 className="h-4 w-4" />
            Delete Organization
          </button>
        </div>
      </div>
    </>
  );
}
