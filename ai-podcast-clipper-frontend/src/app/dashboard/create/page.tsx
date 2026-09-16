import { redirect } from "next/navigation";
import { CreateProjectClient } from "~/components/dashboard/create-project-client";
import { makeAuthGateway } from "~/infrastructure/factories/auth-factory";
import { db } from "~/server/db";

export default async function CreateProjectPage() {
  const userId = await makeAuthGateway().getUserId();

  if (!userId) {
    redirect("/login");
  }

  const userData = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { credits: true },
  });

  return <CreateProjectClient userCredits={userData.credits} />;
}
