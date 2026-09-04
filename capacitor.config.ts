import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.armdd.tmsepod',
  appName: 'DRouteMind',
  webDir: 'public',
  server: {
    url: 'https://tms-e-pod.vercel.app',
    cleartext: true
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
