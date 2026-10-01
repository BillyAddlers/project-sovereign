"use client";

import { create } from "zustand";

/**
 * Global client-side UI state.
 *
 * Server data is deliberately NOT kept here — that belongs to TanStack Query.
 * Zustand owns only ephemeral UI concerns that do not survive a refetch.
 */
export type TaskStatus = "todo" | "in_progress" | "done";

interface TaskFilters {
  search: string;
  status: TaskStatus | "all";
}

interface UiState {
  /** Filters mirrored into the task list query. */
  filters: TaskFilters;
  /** Left-hand navigation collapsed. */
  sidebarCollapsed: boolean;
  setSearch: (search: string) => void;
  setStatus: (status: TaskFilters["status"]) => void;
  resetFilters: () => void;
  toggleSidebar: () => void;
}

const initialFilters: TaskFilters = { search: "", status: "all" };

export const useUiStore = create<UiState>()((set) => ({
  filters: initialFilters,
  sidebarCollapsed: false,
  setSearch: (search) => set((state) => ({ filters: { ...state.filters, search } })),
  setStatus: (status) => set((state) => ({ filters: { ...state.filters, status } })),
  resetFilters: () => set({ filters: initialFilters }),
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
}));
