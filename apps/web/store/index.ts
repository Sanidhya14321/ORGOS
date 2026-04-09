"use client";

import { create } from "zustand";
import type { Goal, Task, User, AgentLog } from "@/lib/models";

export interface OrgosState {
  currentUser: User | null;
  myTasks: Task[];
  activeGoals: Goal[];
  agentLogs: AgentLog[];
  wsConnected: boolean;
  setUser: (user: User | null) => void;
  setTasks: (tasks: Task[]) => void;
  updateTask: (task: Task) => void;
  addGoal: (goal: Goal) => void;
  setGoals: (goals: Goal[]) => void;
  setWsConnected: (connected: boolean) => void;
  setAgentLogs: (logs: AgentLog[]) => void;
}

export const useOrgosStore = create<OrgosState>()((set) => ({
  currentUser: null,
  myTasks: [],
  activeGoals: [],
  agentLogs: [],
  wsConnected: false,
  setUser: (user: User | null) => set({ currentUser: user }),
  setTasks: (tasks: Task[]) => set({ myTasks: tasks }),
  updateTask: (task: Task) =>
    set((state: OrgosState) => ({
      myTasks: state.myTasks.map((item: Task) => (item.id === task.id ? task : item))
    })),
  addGoal: (goal: Goal) =>
    set((state: OrgosState) => ({
      activeGoals: [goal, ...state.activeGoals]
    })),
  setGoals: (goals: Goal[]) => set({ activeGoals: goals }),
  setWsConnected: (connected: boolean) => set({ wsConnected: connected }),
  setAgentLogs: (logs: AgentLog[]) => set({ agentLogs: logs })
}));
