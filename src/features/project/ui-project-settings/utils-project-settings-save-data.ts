import type { UpdateProject } from '@shared/types';

export function getProjectSettingsSaveData({
  data,
  dirtyFields,
}: {
  data: UpdateProject;
  dirtyFields: ReadonlySet<keyof UpdateProject>;
}): UpdateProject {
  const saveData: UpdateProject = {};

  for (const field of dirtyFields) {
    if (field in data) {
      saveData[field] = data[field] as never;
    }
  }

  return saveData;
}
