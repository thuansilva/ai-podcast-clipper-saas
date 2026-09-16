import { redirect } from "next/navigation";
import { RecentVideosClient } from "~/components/dashboard/recent-videos-client";
import { makeAuthGateway } from "~/infrastructure/factories/auth-factory";
import { db } from "~/server/db";

export default async function VideosPage() {
  const userId = await makeAuthGateway().getUserId();

  if (!userId) {
    redirect("/login");
  }

  const userData = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      uploadedFiles: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          s3Key: true,
          displayName: true,
          status: true,
          createdAt: true,
          _count: {
            select: { clips: true },
          },
        },
      },
    },
  });

  const formattedFiles = userData.uploadedFiles.map((file) => ({
    id: file.id,
    s3Key: file.s3Key,
    filename: file.displayName ?? "Unknown filename",
    status: file.status,
    clipsCount: file._count.clips,
    createdAt: file.createdAt,
    thumbnailUrl: undefined, 
  }));

  return (
    <div className="space-y-6">
      <RecentVideosClient uploadedFiles={formattedFiles} />
    </div>
  );
}
