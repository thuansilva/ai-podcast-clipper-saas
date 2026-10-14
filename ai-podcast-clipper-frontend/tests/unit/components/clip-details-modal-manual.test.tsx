import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ClipDetailsModal } from "~/components/clip-details-modal";
import type { Clip } from "@prisma/client";

const clip: Clip = {
  id: "c1", s3Key: "k.mp4", title: "Meu corte", hook: null, viralityScore: null,
  reason: null, startTime: 0, endTime: 30, sourceStartTime: null, sourceEndTime: null, durationSeconds: 30,
  subtitlePreset: "NEON", layoutMode: "SMART_CROP", transcriptWords: [],
  createdAt: new Date(), updatedAt: new Date(), uploadedFileId: "f1", userId: "u1",
};
const props = { clip, playUrl: null, isLoadingUrl: false, isOpen: true, onClose: () => {} };

describe("ClipDetailsModal - corte manual", () => {
  it("mostra 'Corte Manual' e não mostra 'Por que é viral?'", () => {
    render(<ClipDetailsModal {...props} isManual />);
    expect(screen.getByText("Corte Manual")).toBeInTheDocument();
    expect(screen.queryByText(/Por que é viral/)).not.toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });
});
