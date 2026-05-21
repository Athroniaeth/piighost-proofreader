import { useReducer } from "react";

export interface MistakesState {
  enabled: boolean[];
  activeIndex: number | null;
}

export type MistakesAction =
  | { type: "TOGGLE"; index: number }
  | { type: "SET_ACTIVE"; index: number }
  | { type: "SET_ALL"; enabled: boolean }
  | { type: "RESET"; count: number };

export function initState(count: number): MistakesState {
  return { enabled: new Array(count).fill(true), activeIndex: null };
}

export function mistakesReducer(
  state: MistakesState,
  action: MistakesAction
): MistakesState {
  switch (action.type) {
    case "TOGGLE": {
      const enabled = state.enabled.slice();
      enabled[action.index] = !enabled[action.index];
      const activeIndex =
        !enabled[action.index] && state.activeIndex === action.index
          ? null
          : state.activeIndex;
      return { enabled, activeIndex };
    }
    case "SET_ACTIVE":
      return {
        ...state,
        activeIndex: state.activeIndex === action.index ? null : action.index,
      };
    case "SET_ALL":
      return {
        enabled: state.enabled.map(() => action.enabled),
        activeIndex: null,
      };
    case "RESET":
      return initState(action.count);
  }
}

export function useMistakesStore(count: number) {
  return useReducer(mistakesReducer, count, initState);
}
