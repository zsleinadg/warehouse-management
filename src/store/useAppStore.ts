"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AppState {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  currentView: string;
  setCurrentView: (view: string) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      sidebarOpen: true,
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      currentView: "dashboard",
      setCurrentView: (currentView) => set({ currentView }),
    }),
    {
      name: "warehouse-store",
      partialize: (state) => ({
        sidebarOpen: state.sidebarOpen,
        currentView: state.currentView,
      }),
    }
  )
);