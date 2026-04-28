export interface RegisteredFile {
  id: string;
  alias: string;
  url: string;
  status: 'idle' | 'probing' | 'ready' | 'error';
}

export type FilesAction =
  | { type: 'ADD_FILE'; id: string }
  | { type: 'UPDATE_FILE_ALIAS'; id: string; alias: string }
  | { type: 'UPDATE_FILE_URL'; id: string; url: string }
  | { type: 'FILE_PROBE_START'; id: string }
  | { type: 'FILE_PROBE_DONE'; id: string }
  | { type: 'FILE_PROBE_ERROR'; id: string }
  | { type: 'REMOVE_FILE'; id: string };

export const MAX_FILES = 5;

const RESERVED_SQL_KEYWORDS = new Set(['SELECT', 'FROM', 'WHERE', 'JOIN', 'TABLE', 'VIEW']);

export function validateAlias(alias: string, existingAliases: string[]): string | null {
  if (!alias) return 'Alias is required';
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(alias))
    return 'Letters, digits, underscores only; must start with letter or underscore';
  if (alias.length > 32) return 'Maximum 32 characters';
  if (RESERVED_SQL_KEYWORDS.has(alias.toUpperCase())) return `"${alias}" is a reserved SQL keyword`;
  if (existingAliases.includes(alias)) return 'Alias already in use';
  return null;
}

export const initialFilesState: RegisteredFile[] = [];

export function filesReducer(state: RegisteredFile[], action: FilesAction): RegisteredFile[] {
  switch (action.type) {
    case 'ADD_FILE':
      if (state.length >= MAX_FILES) return state;
      return [...state, { id: action.id, alias: '', url: '', status: 'idle' }];

    case 'UPDATE_FILE_ALIAS':
      return state.map((f) => (f.id === action.id ? { ...f, alias: action.alias } : f));

    case 'UPDATE_FILE_URL':
      return state.map((f) => (f.id === action.id ? { ...f, url: action.url } : f));

    case 'FILE_PROBE_START':
      return state.map((f) => (f.id === action.id ? { ...f, status: 'probing' } : f));

    case 'FILE_PROBE_DONE':
      return state.map((f) => (f.id === action.id ? { ...f, status: 'ready' } : f));

    case 'FILE_PROBE_ERROR':
      return state.map((f) => (f.id === action.id ? { ...f, status: 'error' } : f));

    case 'REMOVE_FILE':
      return state.filter((f) => f.id !== action.id);

    default:
      return state;
  }
}
