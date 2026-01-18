import type {
  Project,
  NewProject,
  UpdateProject,
  Task,
  NewTask,
  UpdateTask,
  Provider,
  NewProvider,
  UpdateProvider,
} from '../../shared/types';

export interface Api {
  platform: typeof process.platform;
  projects: {
    findAll: () => Promise<Project[]>;
    findById: (id: string) => Promise<Project | undefined>;
    create: (data: NewProject) => Promise<Project>;
    update: (id: string, data: UpdateProject) => Promise<Project>;
    delete: (id: string) => Promise<void>;
  };
  tasks: {
    findAll: () => Promise<Task[]>;
    findByProjectId: (projectId: string) => Promise<Task[]>;
    findById: (id: string) => Promise<Task | undefined>;
    create: (data: NewTask) => Promise<Task>;
    update: (id: string, data: UpdateTask) => Promise<Task>;
    delete: (id: string) => Promise<void>;
  };
  providers: {
    findAll: () => Promise<Provider[]>;
    findById: (id: string) => Promise<Provider | undefined>;
    create: (data: NewProvider) => Promise<Provider>;
    update: (id: string, data: UpdateProvider) => Promise<Provider>;
    delete: (id: string) => Promise<void>;
  };
}

declare global {
  interface Window {
    api: Api;
  }
}

export const api: Api = typeof window !== 'undefined' && window.api
  ? window.api
  : ({
      platform: 'darwin',
      projects: {
        findAll: async () => [],
        findById: async () => undefined,
        create: async () => { throw new Error('API not available'); },
        update: async () => { throw new Error('API not available'); },
        delete: async () => {},
      },
      tasks: {
        findAll: async () => [],
        findByProjectId: async () => [],
        findById: async () => undefined,
        create: async () => { throw new Error('API not available'); },
        update: async () => { throw new Error('API not available'); },
        delete: async () => {},
      },
      providers: {
        findAll: async () => [],
        findById: async () => undefined,
        create: async () => { throw new Error('API not available'); },
        update: async () => { throw new Error('API not available'); },
        delete: async () => {},
      },
    } as Api);
