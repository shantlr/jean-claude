import { Play } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import FocusLock from 'react-focus-lock';

import { useRegisterKeyboardBindings } from '@/common/context/keyboard-bindings';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import {
  useBranchNames,
  useBuildDefinitionParams,
  useCreateRelease,
  useQueueBuild,
  useYamlPipelineParameters,
} from '@/hooks/use-pipeline-runs';
import type { TrackedPipeline } from '@shared/pipeline-types';
import type { Project } from '@shared/types';

/** Azure DevOps process type for YAML pipelines. */
const PROCESS_TYPE_YAML = 2;

/** Stable empty array to avoid unstable selector references. */
const EMPTY_ARRAY: never[] = [];

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
}: {
  name: string;
  label: string;
  type: 'boolean' | 'text' | 'select';
  value: string;
  options?: { value: string; label: string }[];
  onChange: (name: string, value: string) => void;
}) {
  if (type === 'boolean') {
    return (
      <label className="flex items-center gap-2 py-0.5">
        <input
          type="checkbox"
          className="h-3.5 w-3.5 rounded border-neutral-500 accent-blue-500"
          checked={value === 'true'}
          onChange={(e) => onChange(name, e.target.checked ? 'true' : 'false')}
        />
        <span className="text-xs text-neutral-300">{label}</span>
      </label>
    );
  }

  if (type === 'select' && options && options.length > 0) {
    return (
      <>
        <label className="mb-1 block text-xs text-neutral-400">{label}</label>
        <select
          className="w-full rounded border border-neutral-600 bg-neutral-900 px-3 py-1.5 text-sm text-neutral-200 outline-none focus:border-blue-500"
          value={value}
          onChange={(e) => onChange(name, e.target.value)}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </>
    );
  }

  return (
    <>
      <label className="mb-1 block text-xs text-neutral-400">{label}</label>
      <input
        type="text"
        className="w-full rounded border border-neutral-600 bg-neutral-900 px-3 py-1.5 text-sm text-neutral-200 outline-none focus:border-blue-500"
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
            <p className="text-red-400">
              Project is missing repository configuration. Please link a
              repository first.
            </p>
            <div className="mt-4 flex justify-end">
              <button
                className="rounded px-3 py-1.5 text-sm text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200"
                onClick={onClose}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </FocusLock>,
      document.body,
    );
  }

  return (
    <TriggerRunDialogInner
      providerId={providerId}
      azureProjectId={azureProjectId}
      repoId={repoId}
      definitionId={definitionId}
      defaultBranch={project.defaultBranch ?? 'main'}
      isBuild={isBuild}
      pipelineName={pipeline.name}
      onClose={onClose}
    />
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
  isBuild,
  pipelineName,
  onClose,
}: {
  providerId: string;
  azureProjectId: string;
  repoId: string;
  definitionId: number;
  defaultBranch: string;
  isBuild: boolean;
  pipelineName: string;
  onClose: () => void;
}) {
  // Branch state (build only)
  const [branchFilter, setBranchFilter] = useState(defaultBranch);
  const [showBranchDropdown, setShowBranchDropdown] = useState(false);
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

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

  // Filtered branches for dropdown
  const filteredBranches = useMemo(() => {
    const filter = branchFilter.toLowerCase();
    return branchNames
      .filter((b) => b.toLowerCase().includes(filter))
      .slice(0, 20);
  }, [branchNames, branchFilter]);

  // Single parameter change handler — marks the key as dirty
  const handleParamChange = useCallback((name: string, value: string) => {
    dirtyKeysRef.current.add(name);
    setParameters((prev) => ({ ...prev, [name]: value }));
  }, []);

  // Mutations
  const queueBuild = useQueueBuild();
  const createRelease = useCreateRelease();
  const isPending = queueBuild.isPending || createRelease.isPending;

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
    processInputs,
    yamlParameters,
    overridableVariables,
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

  const hasParams =
    processInputs.length > 0 ||
    uniqueYamlParams.length > 0 ||
    uniqueOverridableVars.length > 0;

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
            Run {pipelineName}
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
          {isBuild && hasParams && (
            <div className="mb-4">
              <label className="mb-2 block text-xs text-neutral-400">
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
                    />
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
