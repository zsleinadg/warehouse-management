"use client";

import { useQuery } from "@tanstack/react-query";

export interface Me {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "OPERATOR" | "VIEWER";
}

async function fetchMe(): Promise<Me | null> {
  const response = await fetch("/api/auth/me");
  if (!response.ok) return null;
  const body = await response.json();
  return body.data ?? null;
}

export function useMe() {
  return useQuery({ queryKey: ["me"], queryFn: fetchMe });
}

export function useCanEdit(): boolean {
  const { data: me } = useMe();
  return me?.role === "ADMIN" || me?.role === "OPERATOR";
}
