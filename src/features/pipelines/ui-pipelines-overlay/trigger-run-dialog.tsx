import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import FocusLock from 'react-focus-lock';
import { Play } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';



import {
  KeyboardLayerProvider,
  useKeyboardLayer,
  useRegisterKeyboardBindings,
} from '@/common/context/keyboard-bindings';
import { Select, type SelectOption } from '@/common/ui/select';
import {
  useBranchNames,
  useBuildDefinitionParams,
  useCreateRelease,
  useQueueBuild,
  useYamlPipelineParameters,
} from '@/hooks/use-pipeline-runs';
import { api } from '@/lib/api';
import { BranchSelect } from '@/common/ui/branch-select';
import { Button } from '@/common/ui/button';
import { Checkbox } from '@/common/ui/checkbox';
import { Input } from '@/common/ui/input';
import { Kbd } from '@/common/ui/kbd';
import type { Project } from '@shared/types';
import type { TrackedPipeline } from '@shared/pipeline-types';
import { useBackgroundJobsStore } from '@/stores/background-jobs';
import { useDebouncedValue } from '@/hooks/use-debounced-value';



/** Azure DevOps process type for YAML pipelines. */
const PROCESS_TYPE_YAML = 2;
const RUN_POLL_INTERVAL_MS = 15_000;
const RUN_POLL_MAX_ATTEMPTS = 240;
const RUN_POLL_MAX_FAILURES = 3;
const TERMINAL_RELEASE_ENV_STATUSES = new Set([
  'canceled',
  'partiallySucceeded',
  'rejected',
  'skipped',
  'succeeded',
]);

/** Stable empty array to avoid unstable selector references. */
const EMPTY_ARRAY: never[] = [];

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function isBuildTerminal(status: string) {
  return status === 'completed';
}

function isBuildSuccessful(result: string) {
  return result === 'succeeded' || result === 'partiallySucceeded';
}

function isReleaseTerminal(status: string, environments: { status: string }[]) {
  if (status !== 'active') return true;
  if (environments.length === 0) return false;

  return environments.every((environment) =>
    TERMINAL_RELEASE_ENV_STATUSES.has(environment.status),
  );
}

function isReleaseSuccessful(environments: { status: string }[]) {
  return (
    environments.length === 0 ||
    environments.every((environment) =>
      ['succeeded', 'partiallySucceeded'].includes(environment.status),
    )
  );
}

async function wait(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// ParameterField — shared input renderer for all parameter sources
// ---------------------------------------------------------------------------

function ParameterField({
  name,
  label,
  type,
  value,
  options,
  onChange,
  layer,
}: {
  name: string;
  label: string;
  type: 'boolean' | 'text' | 'select';
  value: string;
  options?: { value: string; label: string }[];
  onChange: (name: string, value: string) => void;
  layer?: import('@/common/context/keyboard-bindings').KeyboardLayer;
}) {
  if (type === 'boolean') {
    return (
      <Checkbox
        size="sm"
        checked={value === 'true'}
        onChange={(checked) => onChange(name, checked ? 'true' : 'false')}
        label={label}
      />
    );
  }

  if (type === 'select' && options && options.length > 0) {
    return (
      <>
        <label className="text-ink-2 mb-1 block text-xs">{label}</label>
        <Select
          size="sm"
          value={value}
          options={options as SelectOption<string>[]}
          onChange={(v) => onChange(name, v)}
          layer={layer}
        />
      </>
    );
  }

  return (
    <>
      <label className="text-ink-2 mb-1 block text-xs">{label}</label>
      <Input
        size="sm"
        value={value}
        onChange={(e) => onChange(name, e.target.value)}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// TriggerRunDialog
// ---------------------------------------------------------------------------

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
  const providerId = project.repoProviderId;
  const azureProjectId = project.repoProjectId;
  const repoId = project.repoId;
  const definitionId = pipeline.azurePipelineId;

  // Guard: all required project fields must be present
  if (!providerId || !azureProjectId || !repoId) {
    return <TriggerRunDialogError onClose={onClose} />;
  }

  return (
    <TriggerRunDialogInner
      providerId={providerId}
      azureProjectId={azureProjectId}
      repoId={repoId}
      definitionId={definitionId}
      defaultBranch={project.defaultBranch ?? 'main'}
      favoriteBranches={project.favoriteBranches}
      protectedBranches={project.protectedBranches}
      isBuild={isBuild}
      projectId={project.id}
      pipelineName={pipeline.name}
      onClose={onClose}
    />
  );
}

// ---------------------------------------------------------------------------
// Error guard (extracted to avoid unconditional useKeyboardLayer in parent)
// ---------------------------------------------------------------------------

function TriggerRunDialogError({ onClose }: { onClose: () => void }) {
  const layer = useKeyboardLayer('dialog', { exclusive: true });

  useRegisterKeyboardBindings(
    'trigger-run-dialog-error',
    {
      escape: () => {
        onClose();
        return true;
      },
    },
    { layer },
  );

  return createPortal(
    <KeyboardLayerProvider layer={layer}>
      <FocusLock returnFocus>
        <div
          className="bg-bg-0/40 fixed inset-0 z-[60] flex items-center justify-center"
          onClick={onClose}
        >
          <div
            className="text-ink-1 border-glass-border bg-bg-1 w-full max-w-md rounded-lg border p-6 text-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-status-fail">
              Project is missing repository configuration. Please link a
              repository first.
            </p>
            <div className="mt-4 flex justify-end">
              <Button variant="ghost" size="sm" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        </div>
      </FocusLock>
    </KeyboardLayerProvider>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Inner component (all required IDs guaranteed non-null)
// ---------------------------------------------------------------------------

function TriggerRunDialogInner({
  providerId,
  azureProjectId,
  repoId,
  definitionId,
  defaultBranch,
  favoriteBranches,
  protectedBranches,
  isBuild,
  projectId,
  pipelineName,
  onClose,
}: {
  providerId: string;
  azureProjectId: string;
  repoId: string;
  definitionId: number;
  defaultBranch: string;
  favoriteBranches?: string[];
  protectedBranches?: string[];
  isBuild: boolean;
  projectId: string;
  pipelineName: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const addRunningJob = useBackgroundJobsStore((state) => state.addRunningJob);
  const markJobSucceeded = useBackgroundJobsStore(
    (state) => state.markJobSucceeded,
  );
  const markJobFailed = useBackgroundJobsStore((state) => state.markJobFailed);

  // Branch state (build only)
  const [branchFilter, setBranchFilter] = useState(defaultBranch);

  // Debounce branch for YAML parameter fetching to avoid per-keystroke API calls
  const debouncedBranch = useDebouncedValue(branchFilter, 400);

  // Parameters state (build only)
  const [parameters, setParameters] = useState<Record<string, string>>({});

  // Track which parameters the user has manually edited
  const dirtyKeysRef = useRef(new Set<string>());

  // Release description state
  const [description, setDescription] = useState('Triggered from Jean-Claude');

  // Error state
  const [error, setError] = useState<string | null>(null);

  // Fetch branches
  const { data: branchNames = EMPTY_ARRAY } = useBranchNames({
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

  // Classic pipeline process parameters
  const processInputs = useMemo(
    () => definitionDetail?.processParameters?.inputs ?? EMPTY_ARRAY,
    [definitionDetail],
  );

  // YAML pipeline parameters (fetched from the YAML file on the selected branch)
  const isYamlPipeline = definitionDetail?.process?.type === PROCESS_TYPE_YAML;
  const { data: yamlParameters = EMPTY_ARRAY } = useYamlPipelineParameters({
    providerId,
    azureProjectId,
    repoId,
    yamlFilename: definitionDetail?.process?.yamlFilename ?? '',
    branch: debouncedBranch,
    enabled: isBuild && isYamlPipeline === true,
  });

  // Overridable variables (common for both classic and YAML pipelines)
  const overridableVariables = useMemo(() => {
    if (!definitionDetail?.variables) return EMPTY_ARRAY;
    return Object.entries(definitionDetail.variables)
      .filter(([, v]) => v.allowOverride && !v.isSecret)
      .map(([name, v]) => ({ name, defaultValue: v.value ?? '' }));
  }, [definitionDetail]);

  // Deduplicated YAML params & variables (memoised to avoid re-filter per render)
  const uniqueYamlParams = useMemo(
    () =>
      yamlParameters.filter(
        (p) => !processInputs.some((i) => i.name === p.name),
      ),
    [yamlParameters, processInputs],
  );
  const uniqueOverridableVars = useMemo(
    () =>
      overridableVariables.filter(
        (v) =>
          !processInputs.some((i) => i.name === v.name) &&
          !yamlParameters.some((p) => p.name === v.name),
      ),
    [overridableVariables, processInputs, yamlParameters],
  );

  // Compute the full set of currently valid parameter names
  const allParamNames = useMemo(() => {
    const names = new Set<string>();
    for (const i of processInputs) names.add(i.name);
    for (const p of yamlParameters) names.add(p.name);
    for (const v of overridableVariables) names.add(v.name);
    return names;
  }, [processInputs, yamlParameters, overridableVariables]);

  // Initialize / merge parameter defaults when inputs change.
  // Prunes parameters that no longer exist on the current branch and
  // only resets non-dirty (user-edited) values to new defaults.
  useEffect(() => {
    if (allParamNames.size === 0) return;

    setParameters((prev) => {
      const merged: Record<string, string> = {};

      // Only keep keys that are still valid
      for (const [k, v] of Object.entries(prev)) {
        if (allParamNames.has(k)) {
          merged[k] = v;
        }
      }

      // Prune dirty keys that no longer exist
      for (const key of dirtyKeysRef.current) {
        if (!allParamNames.has(key)) {
          dirtyKeysRef.current.delete(key);
        }
      }

      // Add/reset defaults for processInputs
      for (const input of processInputs) {
        if (!(input.name in merged) || !dirtyKeysRef.current.has(input.name)) {
          merged[input.name] = input.defaultValue ?? '';
        }
      }

      // Add/reset defaults for YAML parameters
      for (const param of yamlParameters) {
        if (!(param.name in merged) || !dirtyKeysRef.current.has(param.name)) {
          merged[param.name] =
            param.type === 'boolean'
              ? (param.default ?? 'false')
              : (param.default ?? '');
        }
      }

      // Add/reset defaults for overridable variables
      for (const variable of overridableVariables) {
        if (
          !(variable.name in merged) ||
          !dirtyKeysRef.current.has(variable.name)
        ) {
          merged[variable.name] = variable.defaultValue;
        }
      }

      return merged;
    });
  }, [processInputs, yamlParameters, overridableVariables, allParamNames]);

  // Convert branch names to BranchInfo[] for BranchSelect
  const pipelineBranchInfos = useMemo(
    () => branchNames.map((name: string) => ({ name, lastCommitDate: '' })),
    [branchNames],
  );

  // Single parameter change handler — marks the key as dirty
  const handleParamChange = useCallback((name: string, value: string) => {
    dirtyKeysRef.current.add(name);
    setParameters((prev) => ({ ...prev, [name]: value }));
  }, []);

  // Mutations
  const queueBuild = useQueueBuild();
  const createRelease = useCreateRelease();
  const isPending = queueBuild.isPending || createRelease.isPending;

  const invalidateRunLists = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['pipeline-runs'] });
    queryClient.invalidateQueries({ queryKey: ['pipeline-runs-all'] });
  }, [queryClient]);

  const trackBuildRun = useCallback(
    (buildId: number, buildNumber: string) => {
      const jobId = addRunningJob({
        type: 'pipeline-run',
        title: `Running ${pipelineName}`,
        projectId,
        details: {
          pipelineName,
          runName: buildNumber,
          runId: buildId,
          kind: 'build',
        },
      });

      void (async () => {
        let pollFailures = 0;
        for (let attempt = 0; attempt < RUN_POLL_MAX_ATTEMPTS; attempt += 1) {
          try {
            const build = await api.pipelines.getBuild({
              providerId,
              azureProjectId,
              buildId,
            });

            if (isBuildTerminal(build.status)) {
              invalidateRunLists();
              if (isBuildSuccessful(build.result)) {
                markJobSucceeded(jobId);
              } else {
                markJobFailed(jobId, `Build ${build.result || build.status}`);
              }
              return;
            }
            pollFailures = 0;
          } catch (error) {
            pollFailures += 1;
            if (pollFailures < RUN_POLL_MAX_FAILURES) {
              await wait(RUN_POLL_INTERVAL_MS);
              continue;
            }

            markJobFailed(
              jobId,
              getErrorMessage(error, 'Failed to poll build'),
            );
            return;
          }

          await wait(RUN_POLL_INTERVAL_MS);
        }

        markJobFailed(jobId, 'Timed out waiting for build');
      })();
    },
    [
      addRunningJob,
      azureProjectId,
      invalidateRunLists,
      markJobFailed,
      markJobSucceeded,
      pipelineName,
      projectId,
      providerId,
    ],
  );

  const trackReleaseRun = useCallback(
    (releaseId: number, releaseName: string) => {
      const jobId = addRunningJob({
        type: 'pipeline-run',
        title: `Running ${pipelineName}`,
        projectId,
        details: {
          pipelineName,
          runName: releaseName,
          runId: releaseId,
          kind: 'release',
        },
      });

      void (async () => {
        let pollFailures = 0;
        for (let attempt = 0; attempt < RUN_POLL_MAX_ATTEMPTS; attempt += 1) {
          try {
            const release = await api.pipelines.getRelease({
              providerId,
              azureProjectId,
              releaseId,
            });

            if (isReleaseTerminal(release.status, release.environments)) {
              invalidateRunLists();
              if (isReleaseSuccessful(release.environments)) {
                markJobSucceeded(jobId);
              } else {
                markJobFailed(jobId, `Release ${release.status}`);
              }
              return;
            }
            pollFailures = 0;
          } catch (error) {
            pollFailures += 1;
            if (pollFailures < RUN_POLL_MAX_FAILURES) {
              await wait(RUN_POLL_INTERVAL_MS);
              continue;
            }

            markJobFailed(
              jobId,
              getErrorMessage(error, 'Failed to poll release'),
            );
            return;
          }

          await wait(RUN_POLL_INTERVAL_MS);
        }

        markJobFailed(jobId, 'Timed out waiting for release');
      })();
    },
    [
      addRunningJob,
      azureProjectId,
      invalidateRunLists,
      markJobFailed,
      markJobSucceeded,
      pipelineName,
      projectId,
      providerId,
    ],
  );

  const handleSubmit = useCallback(() => {
    setError(null);
    if (isBuild) {
      // For YAML pipelines: YAML parameters go to templateParameters.
      // For classic pipelines: processInputs go to parameters (JSON-stringified by the service).
      // Overridable variables always go to parameters (variable overrides).
      const yamlParamNames = new Set(yamlParameters.map((p) => p.name));
      const processInputNames = new Set(processInputs.map((i) => i.name));
      const variableNames = new Set(overridableVariables.map((v) => v.name));

      const templateParams: Record<string, string> = {};
      const variableOverrides: Record<string, string> = {};

      for (const [key, value] of Object.entries(parameters)) {
        if (yamlParamNames.has(key)) {
          // YAML template parameters → templateParameters
          templateParams[key] = value;
        } else if (processInputNames.has(key)) {
          // Classic process inputs → parameters (JSON-stringified by service)
          variableOverrides[key] = value;
        } else if (variableNames.has(key)) {
          // Overridable variables → parameters (JSON-stringified by service)
          variableOverrides[key] = value;
        }
      }

      const hasTemplateParams = Object.keys(templateParams).length > 0;
      const hasVariableOverrides = Object.keys(variableOverrides).length > 0;

      queueBuild.mutate(
        {
          providerId,
          azureProjectId,
          definitionId,
          sourceBranch: branchFilter,
          parameters: hasVariableOverrides ? variableOverrides : undefined,
          templateParameters: hasTemplateParams ? templateParams : undefined,
        },
        {
          onSuccess: (build) => {
            invalidateRunLists();
            trackBuildRun(build.id, build.buildNumber);
            onClose();
          },
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
          onSuccess: (release) => {
            invalidateRunLists();
            trackReleaseRun(release.id, release.name);
            onClose();
          },
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
    processInputs,
    yamlParameters,
    overridableVariables,
    description,
    queueBuild,
    createRelease,
    invalidateRunLists,
    trackBuildRun,
    trackReleaseRun,
    onClose,
  ]);

  // Escape key
  const layer = useKeyboardLayer('dialog', { exclusive: true });
  useRegisterKeyboardBindings(
    'trigger-run-dialog',
    {
      escape: () => {
        onClose();
        return true;
      },
      'cmd+enter': () => {
        if (!isPending) handleSubmit();
        return true;
      },
    },
    { layer },
  );

  const hasParams =
    processInputs.length > 0 ||
    uniqueYamlParams.length > 0 ||
    uniqueOverridableVars.length > 0;

  return createPortal(
    <KeyboardLayerProvider layer={layer}>
      <FocusLock returnFocus>
        <div
          className="bg-bg-0/40 fixed inset-0 z-[60] flex items-center justify-center"
          onClick={onClose}
        >
          <div
            className="text-ink-1 border-glass-border bg-bg-1 w-full max-w-md rounded-lg border p-6 text-sm"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Title */}
            <h3 className="text-ink-0 mb-4 text-base font-medium">
              Run {pipelineName}
            </h3>

            {/* Branch selector (build only) */}
            {isBuild && (
              <div className="mb-4">
                <label className="text-ink-2 mb-1 block text-xs">Branch</label>
                <BranchSelect
                  branches={pipelineBranchInfos}
                  favoriteBranches={favoriteBranches}
                  defaultBranch={defaultBranch}
                  protectedBranches={protectedBranches}
                  value={branchFilter || undefined}
                  onChange={(branch) => setBranchFilter(branch)}
                  placeholder="Select branch..."
                  layer={layer}
                />
              </div>
            )}

            {/* Parameters section (build only) */}
            {isBuild && hasParams && (
              <div className="mb-4">
                <label className="text-ink-2 mb-2 block text-xs">
                  Parameters
                </label>
                <div className="space-y-3">
                  {/* Classic pipeline process parameters */}
                  {processInputs.map((input) => (
                    <div key={input.name}>
                      <ParameterField
                        name={input.name}
                        label={input.label || input.name}
                        type={
                          input.type === 'boolean'
                            ? 'boolean'
                            : (input.type === 'pickList' ||
                                  input.type === 'radio') &&
                                input.options
                              ? 'select'
                              : 'text'
                        }
                        value={parameters[input.name] ?? ''}
                        options={
                          input.options
                            ? Object.entries(input.options).map(
                                ([value, optLabel]) => ({
                                  value,
                                  label: optLabel,
                                }),
                              )
                            : undefined
                        }
                        onChange={handleParamChange}
                        layer={layer}
                      />
                    </div>
                  ))}
                  {/* YAML pipeline parameters */}
                  {uniqueYamlParams.map((param) => (
                    <div key={param.name}>
                      <ParameterField
                        name={param.name}
                        label={param.name}
                        type={
                          param.type === 'boolean'
                            ? 'boolean'
                            : param.values && param.values.length > 0
                              ? 'select'
                              : 'text'
                        }
                        value={parameters[param.name] ?? ''}
                        options={param.values?.map((val) => ({
                          value: val,
                          label: val,
                        }))}
                        onChange={handleParamChange}
                        layer={layer}
                      />
                    </div>
                  ))}
                  {/* Overridable variables */}
                  {uniqueOverridableVars.map((variable) => (
                    <div key={variable.name}>
                      <ParameterField
                        name={variable.name}
                        label={variable.name}
                        type="text"
                        value={parameters[variable.name] ?? ''}
                        onChange={handleParamChange}
                        layer={layer}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Release description (release only) */}
            {!isBuild && (
              <div className="mb-4">
                <label className="text-ink-2 mb-1 block text-xs">
                  Description
                </label>
                <Input
                  size="sm"
                  placeholder="Triggered from Jean-Claude"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="text-status-fail bg-status-fail/40 mb-4 rounded px-3 py-2 text-xs">
                {error}
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={onClose}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleSubmit}
                disabled={isPending}
                loading={isPending}
                icon={<Play />}
              >
                {isPending
                  ? 'Queuing...'
                  : isBuild
                    ? 'Queue Build'
                    : 'Create Release'}
                <Kbd shortcut="cmd+enter" />
              </Button>
            </div>
          </div>
        </div>
      </FocusLock>
    </KeyboardLayerProvider>,
    document.body,
  );
}
