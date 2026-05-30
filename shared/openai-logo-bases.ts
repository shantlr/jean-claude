export type OpenAiBaseImageMode = 'builtin' | 'custom';

export const OPENAI_LOGO_BASE_IMAGES = [
  {
    id: 'geometric-adventurers',
    name: 'Geometric Adventurers',
    resourceName: 'default-logo-base.png',
  },
  {
    id: 'cozy-adventurers',
    name: 'Cozy Adventurers',
    resourceName: 'logo-base-cozy-adventurers.png',
  },
] as const;

export type OpenAiLogoBaseImageId =
  (typeof OPENAI_LOGO_BASE_IMAGES)[number]['id'];

export const DEFAULT_OPENAI_LOGO_BASE_IMAGE_ID: OpenAiLogoBaseImageId =
  'geometric-adventurers';

export function isOpenAiLogoBaseImageId(
  value: unknown,
): value is OpenAiLogoBaseImageId {
  return (
    typeof value === 'string' &&
    OPENAI_LOGO_BASE_IMAGES.some((baseImage) => baseImage.id === value)
  );
}
