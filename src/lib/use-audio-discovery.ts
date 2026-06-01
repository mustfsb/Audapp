import { useCallback, useEffect, useRef, useState } from "react";



import { invokeOrFallback } from "@/lib/tauri";

import type { AudioDiscoverySnapshot } from "@/types/discovery";



const POLL_INTERVAL_MS = 5000;



const emptySnapshot: AudioDiscoverySnapshot = {

  devices: [],

  sessions: [],

  status: {

    source: "unavailable",

    state: "loading",

    warnings: [],

    refreshedAt: null,

    deviceCount: 0,

    sessionCount: 0,

  },

};



function mergeSnapshot(

  current: AudioDiscoverySnapshot,

  next: AudioDiscoverySnapshot,

): AudioDiscoverySnapshot {

  if (

    next.status.state === "error" &&

    current.status.state === "ready" &&

    current.devices.length > 0

  ) {

    return {

      ...current,

      status: {

        ...current.status,

        warnings: [

          ...current.status.warnings,

          ...next.status.warnings,

          "Refresh failed; showing last successful snapshot.",

        ],

      },

    };

  }



  return next;

}



export function useAudioDiscovery() {

  const [snapshot, setSnapshot] = useState<AudioDiscoverySnapshot>(emptySnapshot);

  const [isLoading, setIsLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);

  const hasLoadedRef = useRef(false);



  const applySnapshot = useCallback((next: AudioDiscoverySnapshot) => {

    setSnapshot((current) => mergeSnapshot(current, next));

    setError(next.status.state === "error" ? next.status.warnings[0] ?? "Discovery failed" : null);

    hasLoadedRef.current = true;

    setIsLoading(false);

  }, []);



  const refresh = useCallback(async () => {

    if (!hasLoadedRef.current) {

      setIsLoading(true);

    }



    try {

      const next = await invokeOrFallback(

        "get_audio_discovery_snapshot",

        emptySnapshot,

      );

      applySnapshot(next);

    } catch (cause) {

      const message =

        cause instanceof Error ? cause.message : "Failed to refresh audio discovery.";

      setError(message);

    } finally {

      setIsLoading(false);

    }

  }, [applySnapshot]);



  useEffect(() => {

    void refresh();

  }, [refresh]);



  useEffect(() => {

    function handleVisibilityChange() {

      if (document.visibilityState === "visible") {

        void refresh();

      }

    }



    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);

  }, [refresh]);



  useEffect(() => {

    if (document.visibilityState !== "visible") {

      return;

    }



    const timer = window.setInterval(() => {

      if (document.visibilityState === "visible") {

        void refresh();

      }

    }, POLL_INTERVAL_MS);



    return () => window.clearInterval(timer);

  }, [refresh]);



  return {

    snapshot,

    isLoading,

    error,

    refresh,

    applySnapshot,

  };

}

