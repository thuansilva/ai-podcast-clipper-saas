import { describe, it, expect, vi, beforeEach } from "vitest";
import { db } from "~/server/db";
import { getProcessingOptions } from "~/application/services/processing-options.service";

vi.mock("next/cache", () => ({
  unstable_cache: vi.fn((cb: any, keyParts?: string[], options?: any) => {
    const cachedFn = async () => cb();
    cachedFn._keyParts = keyParts;
    cachedFn._options = options;
    return cachedFn;
  }),
}));

vi.mock("~/server/db", () => ({
  db: {
    processingOption: {
      findMany: vi.fn(),
    },
  },
}));

describe("getProcessingOptions", () => {
  beforeEach(() => {
    vi.mocked(db.processingOption.findMany).mockReset();
  });

  it("configures unstable_cache with proper key and revalidation settings", () => {
    expect((getProcessingOptions as any)._keyParts).toEqual(["processing-options"]);
    expect((getProcessingOptions as any)._options).toEqual({
      revalidate: 864000,
      tags: ["processing-options"],
    });
  });

  it("groups options by type", async () => {
    const mockOptions = [
      {
        id: "1",
        type: "GENRE",
        value: "humor",
        label: "Humor",
        order: 1,
        isActive: true,
        isDefault: false,
      },
      {
        id: "2",
        type: "GENRE",
        value: "education",
        label: "Educação",
        order: 2,
        isActive: true,
        isDefault: false,
      },
      {
        id: "3",
        type: "DURATION",
        value: "less_than_30s",
        label: "< 30s",
        order: 1,
        isActive: true,
        isDefault: true,
      },
    ];

    vi.mocked(db.processingOption.findMany).mockResolvedValue(mockOptions as any);

    const res = await getProcessingOptions();

    expect(db.processingOption.findMany).toHaveBeenCalledWith({
      where: { isActive: true },
      orderBy: { order: "asc" },
    });

    expect(res.GENRE).toBeDefined();
    expect(res.GENRE).toHaveLength(2);
    expect(res.GENRE?.[0]?.value).toBe("humor");
    expect(res.GENRE?.[1]?.value).toBe("education");

    expect(res.DURATION).toBeDefined();
    expect(res.DURATION).toHaveLength(1);
    expect(res.DURATION?.[0]?.value).toBe("less_than_30s");
    expect(res.DURATION?.[0]?.isDefault).toBe(true);
  });

  it("returns an empty object when no active options exist", async () => {
    vi.mocked(db.processingOption.findMany).mockResolvedValue([]);

    const res = await getProcessingOptions();

    expect(res).toEqual({});
  });
});
