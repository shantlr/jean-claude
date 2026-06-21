import * as path from 'path';

import { describe, expect, it } from 'vitest';
import { vol } from 'memfs';


import { detectProjectLogos } from './project-logo-detection-service';

describe('detectProjectLogos', () => {
  it('finds logos in nested workspace apps and packages', async () => {
    const root = '/tmp/workspace';
    const webLogo = path.join(root, 'apps', 'web', 'public', 'logo.png');
    const packageIcon = path.join(
      root,
      'packages',
      'site',
      'assets',
      'icon.png',
    );
    const ignoredLogo = path.join(
      root,
      'node_modules',
      'pkg',
      'public',
      'logo.png',
    );

    vol.mkdirSync(path.dirname(webLogo), { recursive: true });
    vol.mkdirSync(path.dirname(packageIcon), { recursive: true });
    vol.mkdirSync(path.dirname(ignoredLogo), { recursive: true });
    vol.writeFileSync(webLogo, 'png');
    vol.writeFileSync(packageIcon, 'png');
    vol.writeFileSync(ignoredLogo, 'png');

    const logos = await detectProjectLogos(root);

    expect(logos).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: webLogo,
          label: 'apps/web: Public logo',
        }),
        expect.objectContaining({
          path: packageIcon,
          label: 'packages/site: Asset icon',
        }),
      ]),
    );
    expect(logos).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ path: ignoredLogo })]),
    );
  });

  it('finds nested mobile app icons', async () => {
    const root = '/tmp/workspace';
    const androidIcon = path.join(
      root,
      'apps',
      'mobile',
      'android',
      'app',
      'src',
      'main',
      'res',
      'mipmap-xxxhdpi',
      'ic_launcher.png',
    );

    vol.mkdirSync(path.dirname(androidIcon), { recursive: true });
    vol.writeFileSync(androidIcon, 'png');

    const logos = await detectProjectLogos(root);

    expect(logos).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: androidIcon,
          label: 'apps/mobile: Android mipmap-xxxhdpi',
          source: 'android',
        }),
      ]),
    );
  });
});
