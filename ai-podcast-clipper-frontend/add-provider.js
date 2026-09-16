const fs = require('fs');

const path = 'src/app/dashboard/layout.tsx';
let content = fs.readFileSync(path, 'utf8');

if (!content.includes('PreferencesStoreProvider')) {
  // Add imports
  content = content.replace(
    'import { ThemeSwitcher } from "~/components/dashboard/header/theme-switcher";',
    `import { ThemeSwitcher } from "~/components/dashboard/header/theme-switcher";
import { PreferencesStoreProvider } from "~/stores/preferences/preferences-provider";
import { PREFERENCE_DEFAULTS } from "~/lib/preferences/preferences-config";`
  );

  // Wrap SidebarProvider
  content = content.replace(
    '<SidebarProvider>',
    '<PreferencesStoreProvider initialValues={PREFERENCE_DEFAULTS}>\n      <SidebarProvider>'
  );
  content = content.replace(
    '</SidebarProvider>',
    '</SidebarProvider>\n    </PreferencesStoreProvider>'
  );

  fs.writeFileSync(path, content, 'utf8');
}
