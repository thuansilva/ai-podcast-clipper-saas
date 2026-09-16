"use client";

import { UserButton } from "@clerk/nextjs";

export function AccountSwitcher() {
  return (
    <div className="flex items-center justify-center h-8 w-8 rounded-full overflow-hidden">
      <UserButton 
        appearance={{
          elements: {
            userButtonAvatarBox: "h-8 w-8",
          },
        }}
      />
    </div>
  );
}
