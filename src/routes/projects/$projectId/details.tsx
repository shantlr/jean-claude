import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useProject, useUpdateProject, useDeleteProject } from '@/hooks/use-projects';
import { PROJECT_COLORS } from '@/lib/colors';

export const Route = createFileRoute('/projects/$projectId/details')({
  component: ProjectDetails,
});

function ProjectDetails() {
  const { projectId } = Route.useParams();
  const navigate = useNavigate();
  const { data: project } = useProject(projectId);
  const updateProject = useUpdateProject();
  const deleteProject = useDeleteProject();

  const [name, setName] = useState('');
  const [color, setColor] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Sync local state when project loads or changes
  useEffect(() => {
    if (project) {
      setName(project.name);
      setColor(project.color);
    }
  }, [project]);

  if (!project) {
    return (
      <div className="flex h-full items-center justify-center text-neutral-500">
        Loading...
      </div>
    );
  }

  async function handleSave() {
    await updateProject.mutateAsync({
      id: projectId,
      data: { name, color },
    });
  }

  async function handleDelete() {
    await deleteProject.mutateAsync(projectId);
    navigate({ to: '/' });
  }

  const hasChanges = name !== project.name || color !== project.color;

  return (
    <div className="h-full overflow-auto p-6">
      <div className="mx-auto max-w-lg">
        <button
          type="button"
          onClick={() => navigate({ to: '/projects/$projectId', params: { projectId } })}
          className="mb-6 flex cursor-pointer items-center gap-2 text-neutral-400 transition-colors hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to tasks
        </button>

        <h1 className="mb-6 text-2xl font-bold">Project Settings</h1>

        <div className="space-y-6">
          {/* Name */}
          <div>
            <label
              htmlFor="name"
              className="mb-1 block text-sm font-medium text-neutral-300"
            >
              Name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-white placeholder-neutral-500 focus:border-neutral-500 focus:outline-none"
            />
          </div>

          {/* Path */}
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-300">
              Path
            </label>
            <div className="rounded-lg border border-neutral-700 bg-neutral-800/50 px-3 py-2">
              <span className="text-sm text-neutral-400">{project.path}</span>
            </div>
          </div>

          {/* Type */}
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-300">
              Type
            </label>
            <span className="inline-block rounded-md bg-neutral-700 px-2 py-1 text-sm">
              {project.type === 'local' ? 'Local folder' : 'Git provider'}
            </span>
          </div>

          {/* Color */}
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-300">
              Color
            </label>
            <div className="flex flex-wrap gap-2">
              {PROJECT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`h-8 w-8 cursor-pointer rounded-lg transition-all ${
                    color === c
                      ? 'ring-2 ring-white ring-offset-2 ring-offset-neutral-900'
                      : 'hover:scale-110'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          {/* Save button */}
          {hasChanges && (
            <button
              type="button"
              onClick={handleSave}
              disabled={updateProject.isPending}
              className="w-full cursor-pointer rounded-lg bg-white px-4 py-2 font-medium text-black transition-colors hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {updateProject.isPending ? 'Saving...' : 'Save Changes'}
            </button>
          )}

          {/* Danger zone */}
          <div className="border-t border-neutral-700 pt-6">
            <h2 className="mb-4 text-lg font-semibold text-red-400">Danger Zone</h2>
            {showDeleteConfirm ? (
              <div className="rounded-lg border border-red-900 bg-red-950/50 p-4">
                <p className="mb-4 text-sm text-neutral-300">
                  Are you sure you want to delete this project? This action cannot be undone.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={deleteProject.isPending}
                    className="cursor-pointer rounded-lg bg-red-600 px-4 py-2 font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                  >
                    {deleteProject.isPending ? 'Deleting...' : 'Delete Project'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(false)}
                    className="cursor-pointer rounded-lg bg-neutral-700 px-4 py-2 font-medium transition-colors hover:bg-neutral-600"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-red-900 bg-red-950/50 px-4 py-2 text-red-400 transition-colors hover:bg-red-950"
              >
                <Trash2 className="h-4 w-4" />
                Delete Project
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
