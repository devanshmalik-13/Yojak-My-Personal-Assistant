/// <reference types="@capacitor/local-notifications" />

import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.mypersonalassistant.app",
  appName: "My Personal Assistant",
  webDir: "dist",
  bundledWebRuntime: false,
  // Native plugin arguments can contain the complete local database. Never
  // emit them to logcat, including from developer/debug builds.
  loggingBehavior: "none",
  plugins: {
    // The UI already owns its safe-area spacing. Disabling Capacitor's early
    // CSS injection also avoids evaluating against a not-yet-created root DOM.
    SystemBars: {
      insetsHandling: "disable",
    },
    LocalNotifications: {
      smallIcon: "ic_stat_assistant",
      iconColor: "#6366F1",
      presentationOptions: ["badge", "sound", "banner", "list"],
    },
  },
};

export default config;
