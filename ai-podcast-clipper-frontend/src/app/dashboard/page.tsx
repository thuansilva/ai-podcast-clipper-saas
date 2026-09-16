import { redirect } from "next/navigation";
import { CreateProjectClient } from "~/components/dashboard/create-project-client";
import { RecentVideosClient } from "~/components/dashboard/recent-videos-client";
import { makeAuthGateway } from "~/infrastructure/factories/auth-factory";
import { makeListUserVideosUseCase } from "~/infrastructure/factories/use-case-factories";
import { getProcessingOptions } from "~/application/services/processing-options.service";
import { db } from "~/server/db";

export default async function DashboardPage() {
  const userId = await makeAuthGateway().getUserId();

  if (!userId) {
    redirect("/login");
  }

  const listUserVideosUseCase = makeListUserVideosUseCase();
  const [userData, options, videos] = await Promise.all([
    db.user.findUniqueOrThrow({
      where: { id: userId },
      select: { credits: true },
    }),
    getProcessingOptions(),
    listUserVideosUseCase.execute({ userId, limit: 5 }),
  ]);

  const credits = userData.credits;

  return (
    <div className="space-y-8">
      <CreateProjectClient userCredits={credits} options={options}>
        <hr className="border-[var(--linha)]" />
        <div>
          <h2 className="text-xl font-semibold mb-4 text-[var(--marfim)]">Acessados Recentemente</h2>
          <RecentVideosClient uploadedFiles={videos.data} />
        </div>
      </CreateProjectClient>
    </div>
  );
}
