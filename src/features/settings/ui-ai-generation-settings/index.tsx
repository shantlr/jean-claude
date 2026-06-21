import { KeyRound, Sparkles, TextQuote } from 'lucide-react';
import { startTransition, useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';


import type { AiSkillSlotConfig, AiSkillSlotKey } from '@shared/types';
import {
  ListDetailLayout,
  ListGroupHeader,
  ListItemButton,
  ListPane,
} from '@/common/ui/list-detail-layout';
import {
  SLOT_DEFINITIONS,
  SlotDetail,
} from '@/features/common/ui-ai-skill-slot';
import {
  useAiGenerationSetting,
  useAiSkillSlotsSetting,
  useSaveAiGenerationSetting,
  useUpdateAiSkillSlotsSetting,
} from '@/hooks/use-settings';
import { api } from '@/lib/api';
import { Button } from '@/common/ui/button';
import { ImagePreviewModal } from '@/common/ui/image-preview-modal';
import { Input } from '@/common/ui/input';
import { SummaryModelSettings } from '@/features/settings/ui-general-settings';
import { Switch } from '@/common/ui/switch';
import { useEnabledBackends } from '@/hooks/use-enabled-backends';



const SUMMARY_MODEL_ITEMS = [
  { key: 'summary-model:claude-code', label: 'Claude Code Summary' },
  { key: 'summary-model:opencode', label: 'OpenCode Summary' },
] as const;
const OPENAI_API_ITEM = {
  key: 'provider:openai-api',
  label: 'OpenAI API Key',
} as const;
const OPENAI_IMAGE_ITEM = {
  key: 'provider:openai-image-generation',
  label: 'OpenAI Image Generation',
} as const;

type SummaryModelSelection = (typeof SUMMARY_MODEL_ITEMS)[number]['key'];
type OpenAiSelection =
  | typeof OPENAI_API_ITEM.key
  | typeof OPENAI_IMAGE_ITEM.key;
type AiGenerationSelection =
  | AiSkillSlotKey
  | SummaryModelSelection
  | OpenAiSelection;

export function AiGenerationSettings() {
  const { data: slots } = useAiSkillSlotsSetting();
  const updateSlots = useUpdateAiSkillSlotsSetting();
  const enabledBackends = useEnabledBackends();
  const [selectedItem, setSelectedItem] = useState<AiGenerationSelection>(
    SLOT_DEFINITIONS[0].key,
  );

  // Use a ref to always access the latest slots value, avoiding stale closure
  const slotsRef = useRef(slots);
  useEffect(() => {
    slotsRef.current = slots;
  }, [slots]);

  const handleUpdate = useCallback(
    (slotKey: AiSkillSlotKey, config: AiSkillSlotConfig | null) => {
      const current = slotsRef.current ?? {};
      if (config === null) {
        const { [slotKey]: _, ...rest } = current;
        updateSlots.mutate(rest);
      } else {
        updateSlots.mutate({ ...current, [slotKey]: config });
      }
    },
    [updateSlots],
  );

  const selectedSlot = SLOT_DEFINITIONS.find(
    (slot) => slot.key === selectedItem,
  );
  const selectedSummaryBackend = selectedItem.startsWith('summary-model:')
    ? selectedItem.replace('summary-model:', '')
    : null;

  return (
    <ListDetailLayout
      list={
        <AiGenerationRail
          slots={slots ?? {}}
          selectedItem={selectedItem}
          onSelect={setSelectedItem}
        />
      }
      detail={
        selectedSlot ? (
          <SlotDetail
            key={selectedSlot.key}
            label={selectedSlot.label}
            description={selectedSlot.description}
            config={slots?.[selectedSlot.key] ?? null}
            enabledBackends={enabledBackends}
            onUpdate={(config) => handleUpdate(selectedSlot.key, config)}
          />
        ) : selectedItem === OPENAI_API_ITEM.key ? (
          <OpenAiApiKeyDetail />
        ) : selectedItem === OPENAI_IMAGE_ITEM.key ? (
          <OpenAiImageGenerationDetail />
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto p-6">
            <div className="max-w-3xl">
              <SummaryModelSettings
                backend={
                  selectedSummaryBackend === 'opencode'
                    ? 'opencode'
                    : 'claude-code'
                }
              />
            </div>
          </div>
        )
      }
    />
  );
}

function AiGenerationRail({
  slots,
  selectedItem,
  onSelect,
}: {
  slots: Partial<Record<AiSkillSlotKey, AiSkillSlotConfig>>;
  selectedItem: AiGenerationSelection;
  onSelect: (item: AiGenerationSelection) => void;
}) {
  const [width, setWidth] = useState(280);

  return (
    <ListPane
      width={width}
      minWidth={220}
      maxWidth={420}
      onWidthChange={setWidth}
      title="AI Generation"
      count={SLOT_DEFINITIONS.length + SUMMARY_MODEL_ITEMS.length + 2}
      headerSupplement={
        <p className="text-[12px] leading-relaxed text-white/45">
          Configure AI-powered content generation by feature.
        </p>
      }
    >
      <ListGroupHeader label={`Slots (${SLOT_DEFINITIONS.length})`} />
      {SLOT_DEFINITIONS.map((slot) => (
        <ListItemButton
          key={slot.key}
          label={slot.label}
          isActive={selectedItem === slot.key}
          isDimmed={!slots[slot.key]}
          size="compact"
          onClick={() => onSelect(slot.key)}
          renderIcon={({ isActive, isDimmed }) => (
            <Sparkles
              size={14}
              className="shrink-0"
              style={{
                color: isDimmed
                  ? 'oklch(0.4 0.01 280)'
                  : isActive
                    ? 'oklch(0.78 0.18 295)'
                    : 'oklch(0.78 0.16 295)',
                opacity: isDimmed ? 0.6 : 1,
              }}
            />
          )}
        />
      ))}

      <ListGroupHeader label="Shared" />
      <ListItemButton
        key={OPENAI_API_ITEM.key}
        label={OPENAI_API_ITEM.label}
        isActive={selectedItem === OPENAI_API_ITEM.key}
        size="compact"
        onClick={() => onSelect(OPENAI_API_ITEM.key)}
        renderIcon={({ isActive }) => (
          <KeyRound
            size={14}
            className="shrink-0"
            style={{
              color: isActive ? 'oklch(0.78 0.18 295)' : 'oklch(0.78 0.16 295)',
            }}
          />
        )}
      />
      <ListItemButton
        key={OPENAI_IMAGE_ITEM.key}
        label={OPENAI_IMAGE_ITEM.label}
        isActive={selectedItem === OPENAI_IMAGE_ITEM.key}
        size="compact"
        onClick={() => onSelect(OPENAI_IMAGE_ITEM.key)}
        renderIcon={({ isActive }) => (
          <Sparkles
            size={14}
            className="shrink-0"
            style={{
              color: isActive ? 'oklch(0.78 0.18 295)' : 'oklch(0.78 0.16 295)',
            }}
          />
        )}
      />
      {SUMMARY_MODEL_ITEMS.map((item) => (
        <ListItemButton
          key={item.key}
          label={item.label}
          isActive={selectedItem === item.key}
          size="compact"
          onClick={() => onSelect(item.key)}
          renderIcon={({ isActive }) => (
            <TextQuote
              size={14}
              className="shrink-0"
              style={{
                color: isActive
                  ? 'oklch(0.78 0.18 295)'
                  : 'oklch(0.78 0.16 295)',
              }}
            />
          )}
        />
      ))}
    </ListPane>
  );
}

function OpenAiApiKeyDetail() {
  const { data: setting } = useAiGenerationSetting();
  const saveSetting = useSaveAiGenerationSetting();
  const [openAiApiKey, setOpenAiApiKey] = useState('');
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const hasStoredKey = !!setting?.openAiApiKey;
  const hasChanges = !!openAiApiKey.trim();

  useEffect(() => {
    startTransition(() => setOpenAiApiKey(''));
    startTransition(() => setSaveMessage(null));
  }, [setting?.openAiApiKey]);

  const handleSave = async () => {
    setSaveMessage(null);
    await saveSetting.mutateAsync({
      openAiApiKey: openAiApiKey.trim(),
      openAiImageGenerationEnabled:
        setting?.openAiImageGenerationEnabled ?? false,
      openAiImageModel: setting?.openAiImageModel ?? 'gpt-image-2',
      openAiLogoPromptContext: setting?.openAiLogoPromptContext ?? '',
    });
    setOpenAiApiKey('');
    setSaveMessage('OpenAI API key saved.');
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-6">
      <div className="max-w-3xl">
        <h2 className="text-ink-1 text-lg font-semibold">OpenAI API Key</h2>
        <p className="text-ink-3 mt-1 text-sm">
          Store your OpenAI API key for features that call OpenAI services.
        </p>

        <div className="border-glass-border bg-bg-1 mt-5 rounded-lg border p-4">
          <label className="text-ink-2 block text-sm font-medium">
            OpenAI API Key
          </label>
          <Input
            type="password"
            value={openAiApiKey}
            onChange={(event) => setOpenAiApiKey(event.target.value)}
            placeholder={
              hasStoredKey ? '••••••••••••••••' : 'Enter your OpenAI API key'
            }
            className="mt-2 max-w-md"
          />
          <p className="text-ink-3 mt-2 text-xs">
            {hasStoredKey
              ? 'Leave empty to keep the existing key. Enter a new value to replace it.'
              : 'Stored encrypted locally.'}
          </p>

          <div className="mt-5 flex items-center gap-3">
            <Button
              variant="primary"
              loading={saveSetting.isPending}
              disabled={saveSetting.isPending || !hasChanges}
              onClick={handleSave}
            >
              Save
            </Button>
            {hasChanges && (
              <span className="text-ink-3 text-xs">Unsaved changes</span>
            )}
            {saveMessage && !hasChanges && (
              <span className="text-ink-3 text-xs">{saveMessage}</span>
            )}
          </div>

          {saveSetting.error && (
            <p className="text-danger mt-3 text-sm">
              {saveSetting.error instanceof Error
                ? saveSetting.error.message
                : 'Failed to save OpenAI API key.'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function OpenAiImageGenerationDetail() {
  const { data: setting } = useAiGenerationSetting();
  const saveSetting = useSaveAiGenerationSetting();
  const queryClient = useQueryClient();
  const [openAiImageGenerationEnabled, setOpenAiImageGenerationEnabled] =
    useState(false);
  const [openAiImageModel, setOpenAiImageModel] = useState('gpt-image-2');
  const [openAiLogoPromptContext, setOpenAiLogoPromptContext] = useState('');
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [baseImageError, setBaseImageError] = useState<string | null>(null);
  const [isSavingBaseImage, setIsSavingBaseImage] = useState(false);
  const [previewImage, setPreviewImage] = useState<{
    title: string;
    dataUrl: string;
  } | null>(null);

  const hasStoredKey = !!setting?.openAiApiKey;
  const canEnableImageGeneration = hasStoredKey;
  const activeBaseImageMode = setting?.openAiBaseImageMode ?? 'builtin';
  const activeBuiltinId =
    setting?.openAiBaseImageBuiltin ?? 'geometric-adventurers';
  const hasChanges =
    openAiImageGenerationEnabled !==
      (setting?.openAiImageGenerationEnabled ?? false) ||
    openAiImageModel !== (setting?.openAiImageModel ?? 'gpt-image-2') ||
    openAiLogoPromptContext !== (setting?.openAiLogoPromptContext ?? '');

  useEffect(() => {
    startTransition(() =>
      setOpenAiImageGenerationEnabled(
        setting?.openAiImageGenerationEnabled ?? false,
      ),
    );
    startTransition(() =>
      setOpenAiImageModel(setting?.openAiImageModel ?? 'gpt-image-2'),
    );
    startTransition(() =>
      setOpenAiLogoPromptContext(setting?.openAiLogoPromptContext ?? ''),
    );
    startTransition(() => setSaveMessage(null));
  }, [
    setting?.openAiApiKey,
    setting?.openAiImageGenerationEnabled,
    setting?.openAiImageModel,
    setting?.openAiLogoPromptContext,
  ]);

  const handleSave = async () => {
    setSaveMessage(null);
    await saveSetting.mutateAsync({
      openAiApiKey: '',
      openAiImageGenerationEnabled:
        openAiImageGenerationEnabled && canEnableImageGeneration,
      openAiImageModel: openAiImageModel.trim() || 'gpt-image-2',
      openAiLogoPromptContext: openAiLogoPromptContext.trim(),
    });
    setSaveMessage('OpenAI image generation settings saved.');
  };

  const { data: baseImageOptions } = useQuery({
    queryKey: ['settings', 'aiGeneration', 'baseImages'],
    queryFn: () => api.aiGeneration.listBaseImages(),
    staleTime: Infinity,
  });

  const activeBaseImage =
    activeBaseImageMode === 'custom' && baseImageOptions?.custom
      ? {
          key: 'custom',
          name: baseImageOptions.custom.name,
          dataUrl: baseImageOptions.custom.dataUrl,
        }
      : baseImageOptions?.builtin.find((item) => item.id === activeBuiltinId);

  const refreshAiGenerationSetting = async () => {
    await queryClient.invalidateQueries({
      queryKey: ['settings', 'aiGeneration'],
    });
  };

  const handleChooseBaseImage = async () => {
    setBaseImageError(null);
    const sourcePath = await api.dialog.openImageFile();
    if (!sourcePath) return;

    setIsSavingBaseImage(true);
    try {
      await api.aiGeneration.saveBaseImage({ sourcePath });
      await refreshAiGenerationSetting();
      await queryClient.invalidateQueries({
        queryKey: ['settings', 'aiGeneration', 'baseImages'],
      });
    } catch (error) {
      setBaseImageError(
        error instanceof Error ? error.message : 'Failed to save base image.',
      );
    } finally {
      setIsSavingBaseImage(false);
    }
  };

  const handleRemoveBaseImage = async () => {
    setBaseImageError(null);
    setIsSavingBaseImage(true);
    try {
      await api.aiGeneration.removeBaseImage();
      await refreshAiGenerationSetting();
      await queryClient.invalidateQueries({
        queryKey: ['settings', 'aiGeneration', 'baseImages'],
      });
    } catch (error) {
      setBaseImageError(
        error instanceof Error ? error.message : 'Failed to remove base image.',
      );
    } finally {
      setIsSavingBaseImage(false);
    }
  };

  const handleSelectBaseImage = async (params: {
    mode: 'builtin' | 'custom';
    builtinId?: string;
  }) => {
    setBaseImageError(null);
    setIsSavingBaseImage(true);
    try {
      await api.aiGeneration.setBaseImageSelection(params);
      await refreshAiGenerationSetting();
      await queryClient.invalidateQueries({
        queryKey: ['settings', 'aiGeneration', 'baseImages'],
      });
    } catch (error) {
      setBaseImageError(
        error instanceof Error ? error.message : 'Failed to select base image.',
      );
    } finally {
      setIsSavingBaseImage(false);
    }
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-6">
      <div className="max-w-3xl">
        <h2 className="text-ink-1 text-lg font-semibold">
          OpenAI Image Generation
        </h2>
        <p className="text-ink-3 mt-1 text-sm">
          Configure OpenAI image generation for high-fidelity project logos.
          Project logo generation requires a saved OpenAI key and produces PNG
          images.
        </p>

        <div className="border-glass-border bg-bg-1 mt-5 rounded-lg border p-4">
          <div className="border-glass-border flex max-w-md items-center justify-between gap-4 rounded-lg border p-3">
            <div>
              <p className="text-ink-2 text-sm font-medium">
                GPT-image project logos
              </p>
              <p className="text-ink-3 mt-1 text-xs">
                Enable OpenAI image generation for project logo generation.
              </p>
            </div>
            <Switch
              checked={openAiImageGenerationEnabled && canEnableImageGeneration}
              disabled={!canEnableImageGeneration}
              onChange={setOpenAiImageGenerationEnabled}
            />
          </div>
          {!canEnableImageGeneration && (
            <p className="text-ink-3 mt-2 text-xs">
              Save an OpenAI API key before enabling image generation.
            </p>
          )}

          <label className="text-ink-2 mt-5 block text-sm font-medium">
            Image model
          </label>
          <Input
            value={openAiImageModel}
            onChange={(event) => setOpenAiImageModel(event.target.value)}
            placeholder="gpt-image-2"
            className="mt-2 max-w-md"
          />
          <p className="text-ink-3 mt-2 text-xs">
            Used for generated project logos. Example:{' '}
            <code className="text-ink-2">gpt-image-2</code>.
          </p>

          <label className="text-ink-2 mt-5 block text-sm font-medium">
            Extra logo prompt context
          </label>
          <textarea
            value={openAiLogoPromptContext}
            onChange={(event) => setOpenAiLogoPromptContext(event.target.value)}
            placeholder="Optional visual or product context to include whenever generating project logos"
            rows={3}
            className="border-glass-border bg-bg-2 text-ink-1 placeholder:text-ink-3 focus:border-accent mt-2 min-h-20 w-full max-w-md resize-y rounded-md border px-3 py-2 text-sm outline-none"
          />
          <p className="text-ink-3 mt-2 text-xs">
            Appended to the logo prompt alongside project summary and base image
            reference.
          </p>

          <div className="mt-5">
            <label className="text-ink-2 block text-sm font-medium">
              Base image
            </label>
            <p className="text-ink-3 mt-1 text-xs">
              Optional style reference for generated project logos. The model
              creates a new mascot using this image as visual direction. When no
              custom image is selected, Jean-Claude uses the bundled Geometric
              Adventurers reference.
            </p>

            {activeBaseImage?.dataUrl && (
              <button
                type="button"
                className="border-glass-border bg-bg-2 hover:bg-glass-light mt-3 flex max-w-md items-center gap-3 rounded-lg border p-3 text-left transition-colors"
                onClick={() =>
                  setPreviewImage({
                    title: activeBaseImage.name,
                    dataUrl: activeBaseImage.dataUrl!,
                  })
                }
              >
                <img
                  src={activeBaseImage.dataUrl}
                  alt="OpenAI base image preview"
                  className="h-16 w-16 rounded-md object-contain"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-ink-1 truncate text-sm font-medium">
                    {activeBaseImage.name}
                  </p>
                  <p className="text-ink-3 text-xs">
                    Active image reference. Click to preview.
                  </p>
                </div>
              </button>
            )}

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {baseImageOptions?.builtin.map((baseImage) => {
                const selected =
                  activeBaseImageMode === 'builtin' &&
                  activeBuiltinId === baseImage.id;
                return (
                  <button
                    type="button"
                    key={baseImage.id}
                    className={`border-glass-border bg-bg-2 hover:bg-glass-light flex items-center gap-3 rounded-lg border p-3 text-left transition-colors ${selected ? 'ring-accent ring-1' : ''}`}
                    onClick={() =>
                      handleSelectBaseImage({
                        mode: 'builtin',
                        builtinId: baseImage.id,
                      })
                    }
                    disabled={isSavingBaseImage}
                  >
                    <img
                      src={baseImage.dataUrl}
                      alt={baseImage.name}
                      className="h-12 w-12 rounded-md object-contain"
                    />
                    <div>
                      <p className="text-ink-1 text-sm font-medium">
                        {baseImage.name}
                      </p>
                      <p className="text-ink-3 text-xs">
                        {selected ? 'Selected' : 'Built-in reference'}
                      </p>
                    </div>
                  </button>
                );
              })}
              {baseImageOptions?.custom?.dataUrl && (
                <button
                  type="button"
                  className={`border-glass-border bg-bg-2 hover:bg-glass-light flex items-center gap-3 rounded-lg border p-3 text-left transition-colors ${activeBaseImageMode === 'custom' ? 'ring-accent ring-1' : ''}`}
                  onClick={() => handleSelectBaseImage({ mode: 'custom' })}
                  disabled={isSavingBaseImage}
                >
                  <img
                    src={baseImageOptions.custom.dataUrl}
                    alt={baseImageOptions.custom.name}
                    className="h-12 w-12 rounded-md object-contain"
                  />
                  <div>
                    <p className="text-ink-1 text-sm font-medium">
                      {baseImageOptions.custom.name}
                    </p>
                    <p className="text-ink-3 text-xs">
                      {activeBaseImageMode === 'custom'
                        ? 'Selected'
                        : 'Custom reference'}
                    </p>
                  </div>
                </button>
              )}
            </div>

            <div className="mt-3 flex items-center gap-2">
              <Button
                variant="secondary"
                loading={isSavingBaseImage}
                disabled={isSavingBaseImage}
                onClick={handleChooseBaseImage}
              >
                {baseImageOptions?.custom
                  ? 'Replace custom image'
                  : 'Choose custom image'}
              </Button>
              {baseImageOptions?.custom && (
                <Button
                  variant="ghost"
                  disabled={isSavingBaseImage}
                  onClick={handleRemoveBaseImage}
                >
                  Remove
                </Button>
              )}
            </div>

            {baseImageError && (
              <p className="text-danger mt-2 text-sm">{baseImageError}</p>
            )}
          </div>

          <div className="mt-5 flex items-center gap-3">
            <Button
              variant="primary"
              loading={saveSetting.isPending}
              disabled={saveSetting.isPending || !hasChanges}
              onClick={handleSave}
            >
              Save
            </Button>
            {hasChanges && (
              <span className="text-ink-3 text-xs">Unsaved changes</span>
            )}
            {saveMessage && !hasChanges && (
              <span className="text-ink-3 text-xs">{saveMessage}</span>
            )}
          </div>

          {saveSetting.error && (
            <p className="text-danger mt-3 text-sm">
              {saveSetting.error instanceof Error
                ? saveSetting.error.message
                : 'Failed to save OpenAI image generation settings.'}
            </p>
          )}
        </div>
      </div>
      <ImagePreviewModal
        isOpen={!!previewImage}
        title={previewImage?.title ?? 'Base image'}
        imageUrl={previewImage?.dataUrl ?? null}
        onClose={() => setPreviewImage(null)}
      />
    </div>
  );
}
