import { Play } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import FocusLock from 'react-focus-lock';

import { useRegisterKeyboardBindings } from '@/common/context/keyboard-bindings';
import {
  useBranchNames,
  useBuildDefinitionParams,
  useCreateRelease,
  useQueueBuild,
} from '@/hooks/use-pipeline-runs';
import type { TrackedPipeline } from '@shared/pipeline-types';
import type { Project } from '@shared/types';

export function TriggerRunDialog({
  project,
  pipeline,
  onClose,
}: {
  project: Project;
  pipeline: TrackedPipeline;
  onClose: () => void;
}) {
  const isBuild = pipeline.kind === 'build';
  const providerId = project.repoProviderId!;
  const azureProjectId = project.repoProjectId!;
  const repoId = project.repoId!;
  const definitionId = pipeline.azurePipelineId;

  // Branch state (build only)
  const [branchFilter, setBranchFilter] = useState(
    project.defaultBranch ?? 'main',
  );
  const [showBranchDropdown, setShowBranchDropdown] = useState(false);
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Parameters state (build only)
  const [parameters, setParameters] = useState<Record<string, string>>({});

  // Release description state
  const [description, setDescription] = useState('Triggered from Jean-Claude');

  // Error state
  const [error, setError] = useState<string | null>(null);

  // Fetch branches
  const { data: branchNames = [] } = useBranchNames({
    providerId,
    azureProjectId,
    repoId,
    enabled: isBuild,
  });

  // Fetch build definition params
  const { data: definitionDetail } = useBuildDefinitionParams({
    providerId,
    azureProjectId,
    definitionId,
    enabled: isBuild,
  });

  const processInputs = useMemo(
    () => definitionDetail?.processParameters?.inputs ?? [],
    [definitionDetail],
  );

  // Initialize parameter defaults when inputs change
  const prevInputsLengthRef = useRef(0);
  useEffect(() => {
    if (
      processInputs.length === 0 ||
      processInputs.length === prevInputsLengthRef.current
    )
      return;
    prevInputsLengthRef.current = processInputs.length;
    const defaults: Record<string, string> = {};
    for (const input of processInputs) {
      defaults[input.name] = input.defaultValue ?? '';
    }
    setParameters(defaults);
  }, [processInputs]);

  // Filtered branches for dropdown
  const filteredBranches = useMemo(() => {
    const filter = branchFilter.toLowerCase();
    return branchNames
      .filter((b) => b.toLowerCase().includes(filter))
      .slice(0, 20);
  }, [branchNames, branchFilter]);

  // Mutations
  const queueBuild = useQueueBuild();
  const createRelease = useCreateRelease();
  const isPending = queueBuild.isPending || createRelease.isPending;

  const handleSubmit = useCallback(() => {
    setError(null);
    if (isBuild) {
      queueBuild.mutate(
        {
          providerId,
          azureProjectId,
          definitionId,
          sourceBranch: branchFilter,
          parameters:
            Object.keys(parameters).length > 0 ? parameters : undefined,
        },
        {
          onSuccess: () => onClose(),
          onError: (err) => setError(err.message),
        },
      );
    } else {
      createRelease.mutate(
        {
          providerId,
          azureProjectId,
          definitionId,
          description: description || undefined,
        },
        {
          onSuccess: () => onClose(),
          onError: (err) => setError(err.message),
        },
      );
    }
  }, [
    isBuild,
    providerId,
    azureProjectId,
    definitionId,
    branchFilter,
    parameters,
    description,
    queueBuild,
    createRelease,
    onClose,
  ]);

  // Escape key
  useRegisterKeyboardBindings('trigger-run-dialog', {
    escape: () => {
      onClose();
      return true;
    },
  });

  // Cleanup blur timeout on unmount
  useEffect(() => {
    return () => {
      if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
    };
  }, []);

  return createPortal(
    <FocusLock returnFocus>
      <div
        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40"
        onClick={onClose}
      >
        <div
          className="w-full max-w-md rounded-lg border border-neutral-700 bg-neutral-800 p-6 text-sm text-neutral-300"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Title */}
          <h3 className="mb-4 text-base font-medium text-neutral-100">
            Run {pipeline.name}
          </h3>

          {/* Branch selector (build only) */}
          {isBuild && (
            <div className="relative mb-4">
              <label className="mb-1 block text-xs text-neutral-400">
                Branch
              </label>
              <input
                type="text"
                className="w-full rounded border border-neutral-600 bg-neutral-900 px-3 py-1.5 text-sm text-neutral-200 outline-none focus:border-blue-500"
                value={branchFilter}
                onChange={(e) => setBranchFilter(e.target.value)}
                onFocus={() => setShowBranchDropdown(true)}
                onBlur={() => {
                  blurTimeoutRef.current = setTimeout(
                    () => setShowBranchDropdown(false),
                    200,
                  );
                }}
              />
              {showBranchDropdown && filteredBranches.length > 0 && (
                <div className="absolute top-full z-10 mt-1 max-h-40 w-full overflow-y-auto rounded border border-neutral-600 bg-neutral-900">
                  {filteredBranches.map((branch) => (
                    <button
                      key={branch}
                      className="block w-full px-3 py-1.5 text-left text-sm text-neutral-300 hover:bg-neutral-700"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setBranchFilter(branch);
                        setShowBranchDropdown(false);
                      }}
                    >
                      {branch}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Parameters section (build only) */}
          {isBuild && processInputs.length > 0 && (
            <div className="mb-4">
              <label className="mb-2 block text-xs text-neutral-400">
                Parameters
              </label>
              <div className="space-y-3">
                {processInputs.map((input) => (
                  <div key={input.name}>
                    <label className="mb-1 block text-xs text-neutral-400">
                      {input.label || input.name}
                    </label>
                    {input.type === 'boolean' ? (
                      <input
                        type="checkbox"
                        checked={parameters[input.name] === 'true'}
                        onChange={(e) =>
                          setParameters((prev) => ({
                            ...prev,
                            [input.name]: e.target.checked ? 'true' : 'false',
                          }))
                        }
                      />
                    ) : (input.type === 'pickList' || input.type === 'radio') &&
                      input.options ? (
                      <select
                        className="w-full rounded border border-neutral-600 bg-neutral-900 px-3 py-1.5 text-sm text-neutral-200 outline-none focus:border-blue-500"
                        value={parameters[input.name] ?? ''}
                        onChange={(e) =>
                          setParameters((prev) => ({
                            ...prev,
                            [input.name]: e.target.value,
                          }))
                        }
                      >
                        {Object.entries(input.options).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        className="w-full rounded border border-neutral-600 bg-neutral-900 px-3 py-1.5 text-sm text-neutral-200 outline-none focus:border-blue-500"
                        value={parameters[input.name] ?? ''}
                        onChange={(e) =>
                          setParameters((prev) => ({
                            ...prev,
                            [input.name]: e.target.value,
                          }))
                        }
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Release description (release only) */}
          {!isBuild && (
            <div className="mb-4">
              <label className="mb-1 block text-xs text-neutral-400">
                Description
              </label>
              <input
                type="text"
                className="w-full rounded border border-neutral-600 bg-neutral-900 px-3 py-1.5 text-sm text-neutral-200 outline-none focus:border-blue-500"
                placeholder="Triggered from Jean-Claude"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mb-4 rounded bg-red-900/40 px-3 py-2 text-xs text-red-300">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <button
              className="rounded px-3 py-1.5 text-sm text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              className="flex items-center gap-1.5 rounded bg-green-700 px-3 py-1.5 text-sm text-white hover:bg-green-600 disabled:opacity-50"
              onClick={handleSubmit}
              disabled={isPending}
            >
              <Play className="h-3.5 w-3.5" />
              {isPending
                ? 'Queuing...'
                : isBuild
                  ? 'Queue Build'
                  : 'Create Release'}
            </button>
          </div>
        </div>
      </div>
    </FocusLock>,
    document.body,
  );
}
