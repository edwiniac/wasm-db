import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { queryReducer, initialState } from './queryState';
import type { QueryState, QueryAction } from './queryState';

export interface QueryStore extends QueryState {
  dispatch: (action: QueryAction) => void;
}

export const useQueryStore = create<QueryStore>()(
  persist(
    (set) => ({
      ...initialState,
      dispatch: (action: QueryAction) =>
        set((state) => ({ ...queryReducer(state as QueryState, action) })),
    }),
    {
      name: 'wasm-db-query',
      partialize: (state) => ({
        parquetURL: state.parquetURL,
        queryText: state.queryText,
      }),
    },
  ),
);
