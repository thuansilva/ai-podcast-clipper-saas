import * as React from "react";
import { cn } from "~/lib/utils";

export type SelectProps = React.ComponentProps<"select">;

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <select
        ref={ref}
        data-slot="select"
        className={cn(
          "flex h-9 w-full rounded-md border border-[var(--linha)] bg-[var(--tinta)] px-3 py-1 text-sm text-[var(--marfim)] shadow-xs transition-colors focus-visible:ring-2 focus-visible:ring-[var(--ouro)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      >
        {children}
      </select>
    );
  },
);
Select.displayName = "Select";

export { Select };
