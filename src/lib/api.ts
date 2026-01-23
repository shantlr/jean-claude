import type {
  AgentMessage,
  AgentMessageEvent,
  AgentStatusEvent,
  AgentPermissionEvent,
  AgentQuestionEvent,
  PermissionResponse,
  QuestionResponse,
} from '../../shared/agent-types';
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
  InteractionMode,
} from '../../shared/types';

export interface PackageJson {
  name?: string;
}

export type AgentEventCallback<T> = (event: T) => void;
export type UnsubscribeFn = () => void;

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
    markAsRead: (id: string) => Promise<Task>;
    updateLastReadIndex: (id: string, lastReadIndex: number) => Promise<Task>;
    setMode: (id: string, mode: InteractionMode) => Promise<Task>;
  };
  providers: {
    findAll: () => Promise<Provider[]>;
    findById: (id: string) => Promise<Provider | undefined>;
    create: (data: NewProvider) => Promise<Provider>;
    update: (id: string, data: UpdateProvider) => Promise<Provider>;
    delete: (id: string) => Promise<void>;
  };
  dialog: {
    openDirectory: () => Promise<string | null>;
  };
  fs: {
    readPackageJson: (dirPath: string) => Promise<PackageJson | null>;
    readFile: (filePath: string) => Promise<{ content: string; language: string } | null>;
  };
  agent: {
    start: (taskId: string) => Promise<void>;
    stop: (taskId: string) => Promise<void>;
    respond: (
      taskId: string,
      requestId: string,
      response: PermissionResponse | QuestionResponse
    ) => Promise<void>;
    sendMessage: (taskId: string, message: string) => Promise<void>;
    getMessages: (taskId: string) => Promise<AgentMessage[]>;
    getMessageCount: (taskId: string) => Promise<number>;
    onMessage: (callback: AgentEventCallback<AgentMessageEvent>) => UnsubscribeFn;
    onStatus: (callback: AgentEventCallback<AgentStatusEvent>) => UnsubscribeFn;
    onPermission: (callback: AgentEventCallback<AgentPermissionEvent>) => UnsubscribeFn;
    onQuestion: (callback: AgentEventCallback<AgentQuestionEvent>) => UnsubscribeFn;
  };
}

declare global {
  interface Window {
    api: Api;
  }
}

const hasWindowApi = typeof window !== 'undefined' && window.api;
console.log('window.api available:', hasWindowApi, window?.api);

export const api: Api = hasWindowApi
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
        markAsRead: async () => { throw new Error('API not available'); },
        updateLastReadIndex: async () => { throw new Error('API not available'); },
        setMode: async () => { throw new Error('API not available'); },
      },
      providers: {
        findAll: async () => [],
        findById: async () => undefined,
        create: async () => { throw new Error('API not available'); },
        update: async () => { throw new Error('API not available'); },
        delete: async () => {},
      },
      dialog: {
        openDirectory: async () => null,
      },
      fs: {
        readPackageJson: async () => null,
        readFile: async () => null,
      },
      agent: {
        start: async () => { throw new Error('API not available'); },
        stop: async () => { throw new Error('API not available'); },
        respond: async () => { throw new Error('API not available'); },
        sendMessage: async () => { throw new Error('API not available'); },
        getMessages: async () => [],
        getMessageCount: async () => 0,
        onMessage: () => () => {},
        onStatus: () => () => {},
        onPermission: () => () => {},
        onQuestion: () => () => {},
      },
    } as Api);
