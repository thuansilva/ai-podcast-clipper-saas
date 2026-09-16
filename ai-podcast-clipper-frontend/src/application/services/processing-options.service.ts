import { unstable_cache } from "next/cache";
import { db } from "~/server/db";

export type ProcessingOption = {
  id: string;
  type: string;
  value: string;
  label: string;
  order: number;
  isActive: boolean;
  isDefault: boolean;
  createdAt?: Date;
  updatedAt?: Date;
};

export const getProcessingOptions = unstable_cache(
  async () => {
    const options = await db.processingOption.findMany({
      where: { isActive: true },
      orderBy: { order: "asc" },
    });

    return options.reduce((acc, opt) => {
      const list = acc[opt.type] ?? [];
      list.push(opt);
      acc[opt.type] = list;
      return acc;
    }, {} as Record<string, ProcessingOption[]>);
  },
  ["processing-options"],
  { revalidate: 864000, tags: ["processing-options"] }
);
