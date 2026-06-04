import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.qwq.galacticrpg.mobile',
  appName: 'Galactic RPG Mobile',
  webDir: 'www',
  bundledWebRuntime: false,
  android: {
    backgroundColor: '#05080d',
    allowMixedContent: false
  }
};

export default config;
