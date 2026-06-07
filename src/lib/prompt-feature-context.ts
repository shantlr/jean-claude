import type { ProjectFeatureMap, ProjectFeatureMapItem } from '@shared/types';

export type FlatProjectFeature = ProjectFeatureMapItem & {
  depth: number;
  path: string[];
};

const FEATURE_REFERENCE_PREFIX = String.raw`(^|[\s([{\'"\`])`;
const FEATURE_REFERENCE_SUFFIX = String.raw`(?!\s*>)(?=$|\s|[.,;:!?\)\]' "])`;

export function flattenProjectFeatures(
  features: ProjectFeatureMapItem[] | undefined,
  path: string[] = [],
  depth = 0,
): FlatProjectFeature[] {
  if (!features) return [];

  return features.flatMap((feature) => {
    const featurePath = [...path, feature.name];
    return [
      { ...feature, depth, path: featurePath },
      ...flattenProjectFeatures(feature.children, featurePath, depth + 1),
    ];
  });
}

export function escapeFeatureXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export function buildFeatureContextXml(
  features: ProjectFeatureMapItem[] | FlatProjectFeature[],
): string {
  if (features.length === 0) return '';

  const lines = ['<feature_context>'];
  for (const feature of features) {
    lines.push(`  <feature name="${escapeFeatureXml(feature.name)}">`);
    lines.push(`    <summary>${escapeFeatureXml(feature.summary)}</summary>`);
    if (feature.key_files.length > 0) {
      lines.push('    <key_files>');
      for (const file of feature.key_files) {
        lines.push(`      <file>${escapeFeatureXml(file)}</file>`);
      }
      lines.push('    </key_files>');
    }
    lines.push('  </feature>');
  }
  lines.push('</feature_context>');

  return `\n\n${lines.join('\n')}`;
}

export function getReferencedFeatures({
  text,
  featureMap,
}: {
  text: string;
  featureMap: ProjectFeatureMap | null | undefined;
}): FlatProjectFeature[] {
  const features = flattenProjectFeatures(featureMap?.features);
  if (!text || features.length === 0) return [];

  const referenced = new Set<string>();
  for (const feature of features.sort(
    (a, b) =>
      getFeatureReferenceText(b, features).length -
      getFeatureReferenceText(a, features).length,
  )) {
    if (
      getFeatureReferenceRegex(getFeatureReferenceText(feature, features)).test(
        text,
      )
    ) {
      referenced.add(feature.id);
    }
  }

  return features.filter((feature) => referenced.has(feature.id));
}

export function expandFeatureReferencesInPrompt({
  text,
  featureMap,
}: {
  text: string;
  featureMap: ProjectFeatureMap | null | undefined;
}): string {
  const features = getReferencedFeatures({ text, featureMap });
  if (features.length === 0) return text;

  let prompt = text;
  for (const feature of features.sort(
    (a, b) =>
      getFeatureReferenceText(b, features).length -
      getFeatureReferenceText(a, features).length,
  )) {
    prompt = prompt.replace(
      getFeatureReferenceRegex(getFeatureReferenceText(feature, features)),
      `$1${feature.name}`,
    );
  }

  return `${prompt.trimEnd()}${buildFeatureContextXml(features)}`;
}

export function getFeatureReferenceText(
  feature: FlatProjectFeature,
  features: FlatProjectFeature[],
): string {
  const duplicateName = features.some(
    (item) => item.id !== feature.id && item.name === feature.name,
  );
  return duplicateName ? feature.path.join(' > ') : feature.name;
}

function getFeatureReferenceRegex(name: string): RegExp {
  return new RegExp(
    `${FEATURE_REFERENCE_PREFIX}#${escapeRegExp(name)}${FEATURE_REFERENCE_SUFFIX}`,
    'g',
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
