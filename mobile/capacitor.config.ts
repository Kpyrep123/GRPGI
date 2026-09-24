import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.qwq.galacticrpg.mobile',
  appName: 'Galactic RPG Mobile',
  webDir: 'generated-www',
  bundledWebRuntime: false,
  android: {
    backgroundColor: '#0d0c09',
    allowMixedContent: false
  }
};

export default config;
