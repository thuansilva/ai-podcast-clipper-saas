import { redirect } from "next/navigation";
import { ClipDisplay } from "~/components/clip-display";
import { makeAuthGateway } from "~/infrastructure/factories/auth-factory";
import { db } from "~/server/db";

export default async function ClipsPage() {
  const userId = await makeAuthGateway().getUserId();

  if (!userId) {
    redirect("/login");
  }

  const userData = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      clips: {
        orderBy: {
          createdAt: "desc",
        },
      },
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--marfim)]">Meus Cortes</h1>
        <p className="text-sm text-[var(--fumaca)]">Visualize, edite legendas e faça download dos seus cortes prontos para publicação.</p>
      </div>

      <div className="rounded-2xl border border-[var(--linha)] bg-[var(--superficie)] p-6 shadow-lg">
        <ClipDisplay clips={userData.clips} />
      </div>
    </div>
  );
}
