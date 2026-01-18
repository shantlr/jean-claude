import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, Folder } from 'lucide-react';
import type { FormEvent } from 'react';
import { useState } from 'react';

import { useCreateProject } from '@/hooks/use-projects';
import { api } from '@/lib/api';
import { getRandomColor, PROJECT_COLORS } from '@/lib/colors';

export const Route = createFileRoute('/projects/new')({
  component: AddProjectPage,
});

type PageState = 'source-selection' | 'form';

interface FormData {
  name: string;
  path: string;
  color: string;
}

function AddProjectPage() {
  const navigate = useNavigate();
  const createProject = useCreateProject();

  const [pageState, setPageState] = useState<PageState>('source-selection');
  const [formData, setFormData] = useState<FormData | null>(null);

  async function handleSelectLocalFolder() {
    const selectedPath = await api.dialog.openDirectory();
    console.log('Selected path:', selectedPath);
    if (!selectedPath) return;

    const name = await inferProjectName(selectedPath);
    const color = getRandomColor();

    setFormData({ name, path: selectedPath, color });
    setPageState('form');
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!formData) return;

    const project = await createProject.mutateAsync({
      name: formData.name,
      path: formData.path,
      type: 'local',
      color: formData.color,
      updatedAt: new Date().toISOString(),
    });

    navigate({ to: '/projects/$projectId', params: { projectId: project.id } });
  }

  function handleBack() {
    setPageState('source-selection');
    setFormData(null);
  }

  if (pageState === 'form' && formData) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="w-full max-w-md">
          <button
            type="button"
            onClick={handleBack}
            className="mb-6 flex cursor-pointer items-center gap-2 text-neutral-400 transition-colors hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>

          <h1 className="mb-6 text-2xl font-bold">Add Local Project</h1>

          <form onSubmit={handleSubmit} className="space-y-4">
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
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-white placeholder-neutral-500 focus:border-neutral-500 focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-300">
                Path
              </label>
              <div className="rounded-lg border border-neutral-700 bg-neutral-800/50 px-3 py-2">
                <span className="truncate text-sm text-neutral-400">
                  {formData.path}
                </span>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-300">
                Color
              </label>
              <div className="flex flex-wrap gap-2">
                {PROJECT_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setFormData({ ...formData, color })}
                    className={`h-8 w-8 cursor-pointer rounded-lg transition-all ${
                      formData.color === color
                        ? 'ring-2 ring-white ring-offset-2 ring-offset-neutral-900'
                        : 'hover:scale-110'
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={createProject.isPending}
              className="w-full cursor-pointer rounded-lg bg-white px-4 py-2 font-medium text-black transition-colors hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {createProject.isPending ? 'Adding...' : 'Add Project'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="w-full max-w-md">
        <h1 className="mb-6 text-center text-2xl font-bold">Add Project</h1>

        <div className="grid gap-4">
          <button
            type="button"
            onClick={handleSelectLocalFolder}
            className="cursor-pointer flex flex-col items-center gap-3 rounded-xl border-2 border-neutral-700 bg-neutral-800/50 p-6 transition-colors hover:border-neutral-500 hover:bg-neutral-800"
          >
            <Folder className="h-10 w-10 text-neutral-400" />
            <span className="font-medium">Local Folder</span>
          </button>
        </div>
      </div>
    </div>
  );
}

async function inferProjectName(folderPath: string): Promise<string> {
  const pkg = await api.fs.readPackageJson(folderPath);
  if (pkg?.name) {
    return pkg.name;
  }
  // Fallback: extract folder name from path
  return folderPath.split(/[/\\]/).pop() || 'Untitled';
}
