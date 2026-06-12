import { describe, expect, it } from 'vitest';
import { renderConsolePage } from '../server/src/consolePage';

describe('local console page', () => {
  it('opens the workbench in a new tab and exposes a shutdown control', () => {
    const html = renderConsolePage({
      appName: 'Media Location',
      appVersion: '0.3.0',
      port: 6755,
      amapKey: '',
      amapSecurityCode: '',
      libraryRoots: [],
      backupBeforeWrite: false,
      loadVideoContent: false,
    });

    expect(html).toContain('href="/" target="_blank"');
    expect(html).toContain('id="shutdownApp"');
    expect(html).toContain("fetch('/api/shutdown'");
  });

  it('tries to close the console page after shutdown is confirmed', () => {
    const html = renderConsolePage({
      appName: 'Media Location',
      appVersion: '0.3.0',
      port: 6755,
      amapKey: '',
      amapSecurityCode: '',
      libraryRoots: [],
      backupBeforeWrite: false,
      loadVideoContent: false,
    });

    expect(html).toContain('function closeConsolePage()');
    expect(html).toContain('window.close()');
    expect(html).toContain('setTimeout(closeConsolePage');
  });
});
