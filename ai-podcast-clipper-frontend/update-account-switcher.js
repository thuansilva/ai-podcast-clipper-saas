const fs = require('fs');

const path = 'src/components/dashboard/header/account-switcher.tsx';
let content = fs.readFileSync(path, 'utf8');

// Add imports
content = content.replace(
  'import { BadgeCheck, Bell, Check, CreditCard, LogOut } from "lucide-react";',
  `import { BadgeCheck, Bell, Check, CreditCard, LogOut } from "lucide-react";
import { SignOutButton } from "@clerk/nextjs";
import Link from "next/link";`
);

// Replace billing with link
content = content.replace(
  '<DropdownMenuItem>\n            <CreditCard />\n            Billing\n          </DropdownMenuItem>',
  '<DropdownMenuItem asChild>\n            <Link href="/dashboard/billing" className="w-full cursor-pointer">\n              <CreditCard />\n              Billing\n            </Link>\n          </DropdownMenuItem>'
);

// Replace logout
content = content.replace(
  '<DropdownMenuItem>\n          <LogOut />\n          Log out\n        </DropdownMenuItem>',
  '<SignOutButton>\n          <DropdownMenuItem className="w-full cursor-pointer">\n            <LogOut />\n            Log out\n          </DropdownMenuItem>\n        </SignOutButton>'
);

fs.writeFileSync(path, content, 'utf8');
