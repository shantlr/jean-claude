import type {
  AgentMessage,
  AgentMessageEvent,
  AgentStatusEvent,
  AgentPermissionEvent,
  AgentQuestionEvent,
  AgentNameUpdatedEvent,
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
  AppSettings,
} from '../../shared/types';

export interface PackageJson {
  name?: string;
}

export interface QueryTableParams {
  table: string;
  search?: string;
  limit: number;
  offset: number;
}

export interface QueryTableResult {
  columns: string[];
  rows: Record<string, unknown>[];
  total: number;
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
    reorder: (orderedIds: string[]) => Promise<Project[]>;
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
    toggleUserCompleted: (id: string) => Promise<Task>;
    clearUserCompleted: (id: string) => Promise<Task>;
    addSessionAllowedTool: (id: string, toolName: string) => Promise<Task>;
    removeSessionAllowedTool: (id: string, toolName: string) => Promise<Task>;
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
    openApplication: () => Promise<{ path: string; name: string } | null>;
  };
  fs: {
    readPackageJson: (dirPath: string) => Promise<PackageJson | null>;
    readFile: (filePath: string) => Promise<{ content: string; language: string } | null>;
  };
  settings: {
    get: <K extends keyof AppSettings>(key: K) => Promise<AppSettings[K]>;
    set: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => Promise<void>;
  };
  shell: {
    openInEditor: (dirPath: string) => Promise<void>;
    getAvailableEditors: () => Promise<{ id: string; available: boolean }[]>;
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
    onNameUpdated: (callback: AgentEventCallback<AgentNameUpdatedEvent>) => UnsubscribeFn;
  };
  debug: {
    getTableNames: () => Promise<string[]>;
    queryTable: (params: QueryTableParams) => Promise<QueryTableResult>;
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
        reorder: async () => [],
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
        toggleUserCompleted: async () => { throw new Error('API not available'); },
        clearUserCompleted: async () => { throw new Error('API not available'); },
        addSessionAllowedTool: async () => { throw new Error('API not available'); },
        removeSessionAllowedTool: async () => { throw new Error('API not available'); },
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
        openApplication: async () => null,
      },
      fs: {
        readPackageJson: async () => null,
        readFile: async () => null,
      },
      settings: {
        get: async () => { throw new Error('API not available'); },
        set: async () => { throw new Error('API not available'); },
      },
      shell: {
        openInEditor: async () => {},
        getAvailableEditors: async () => [],
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
        onNameUpdated: () => () => {},
      },
      debug: {
        getTableNames: async () => [],
        queryTable: async () => ({ columns: [], rows: [], total: 0 }),
      },
    } as Api);
