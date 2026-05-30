import { invoke, type InvokeArgs } from "@tauri-apps/api/core";

export function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function invokeOrFallback<T>(command: string, fallback: T): Promise<T> {
  if (!isTauriRuntime()) {
    return fallback;
  }

  try {
    return await invoke<T>(command);
  } catch {
    return fallback;
  }
}

export async function invokeCommand<T>(
  command: string,
  args?: InvokeArgs,
): Promise<T> {
  if (!isTauriRuntime()) {
    throw new Error(`Command "${command}" requires the Tauri desktop runtime.`);
  }

  if (args === undefined) {
    return invoke<T>(command);
  }

  return invoke<T>(command, args);
}
