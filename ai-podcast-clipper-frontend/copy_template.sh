#!/bin/bash
set -e

# Remove our UI components
rm -rf src/components/ui

# Copy template UI components
cp -r /tmp/admin-template/src/components/ui src/components/ui

# Replace "cn" with "~/lib/utils" in all UI components
find src/components/ui -type f -name "*.tsx" -o -name "*.ts" -exec sed -i 's/from "cn"/from "~\/lib\/utils"/g' {} +

# Copy sidebar and header components
mkdir -p src/components/dashboard/sidebar
cp -r /tmp/admin-template/src/app/\(main\)/dashboard/_components/sidebar/* src/components/dashboard/sidebar/

mkdir -p src/components/dashboard/header
cp -r /tmp/admin-template/src/app/\(main\)/dashboard/_components/header/* src/components/dashboard/header/

# Fix paths in copied dashboard components
find src/components/dashboard/sidebar src/components/dashboard/header -type f -name "*.tsx" -o -name "*.ts" -exec sed -i 's/from "cn"/from "~\/lib\/utils"/g' {} +
find src/components/dashboard/sidebar src/components/dashboard/header -type f -name "*.tsx" -o -name "*.ts" -exec sed -i 's/@\/components\/ui/~\/components\/ui/g' {} +
find src/components/dashboard/sidebar src/components/dashboard/header -type f -name "*.tsx" -o -name "*.ts" -exec sed -i 's/@\/app\/(main)\/dashboard\/_components\/sidebar/~\/components\/dashboard\/sidebar/g' {} +
find src/components/dashboard/sidebar src/components/dashboard/header -type f -name "*.tsx" -o -name "*.ts" -exec sed -i 's/@\/app\/(main)\/dashboard\/_components\/header/~\/components\/dashboard\/header/g' {} +
find src/components/dashboard/sidebar src/components/dashboard/header -type f -name "*.tsx" -o -name "*.ts" -exec sed -i 's/@\/data\/users/~\/data\/users/g' {} +
find src/components/dashboard/sidebar src/components/dashboard/header -type f -name "*.tsx" -o -name "*.ts" -exec sed -i 's/@\/server\/server-actions/~\/server\/server-actions/g' {} +
find src/components/dashboard/sidebar src/components/dashboard/header -type f -name "*.tsx" -o -name "*.ts" -exec sed -i 's/@\/navigation\/sidebar\/sidebar-items/~\/navigation\/sidebar-items/g' {} +

# Copy data and navigation folders
cp -r /tmp/admin-template/src/data src/data
cp -r /tmp/admin-template/src/navigation src/navigation
find src/data src/navigation -type f -name "*.ts" -exec sed -i 's/from "cn"/from "~\/lib\/utils"/g' {} +

# Copy Layout components (like SearchDialog has a dependency on cmdk which we may need)
echo "Template copied successfully."
