import { redirect } from "next/navigation";
import { DashboardClient } from "~/components/dashboard-client";
import { makeAuthGateway } from "~/infrastructure/factories/auth-factory";
import { db } from "~/server/db";

export default async function DashboardPage() {
  const userId = await makeAuthGateway().getUserId();

  if (!userId) {
    redirect("/login");
  }

  const userData = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      credits: true,
      plan: true,
      uploadedFiles: {
        where: {
          uploaded: true,
        },
        select: {
          id: true,
          s3Key: true,
          displayName: true,
          status: true,
          createdAt: true,
          _count: {
            select: {
              clips: true,
            },
          },
        },
      },
      clips: {
        orderBy: {
          createdAt: "desc",
        },
      },
    },
  });

  const formattedFiles = userData.uploadedFiles.map((file) => ({
    id: file.id,
    s3Key: file.s3Key,
    filename: file.displayName ?? "Unkown filename",
    status: file.status,
    clipsCount: file._count.clips,
    createdAt: file.createdAt,
  }));

  return (
    <DashboardClient
      uploadedFiles={formattedFiles}
      clips={userData.clips}
      userCredits={userData.credits}
      userPlan={userData.plan ?? "STARTER"}
    />
  );
}
