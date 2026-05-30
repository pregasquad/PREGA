import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.pregasquad.manager',
  appName: 'PREGASQUAD Manager',
  webDir: 'dist/public',
  server: {
    url: 'https://17e963ee-d0bc-4960-a331-07e811557d5e-00-38fakqf3wxjc3.picard.replit.dev',
    cleartext: true
  },
  android: {
    allowMixedContent: true
  }
};

export default config;
