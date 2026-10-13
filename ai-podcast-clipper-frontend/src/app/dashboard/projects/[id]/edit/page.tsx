import { db } from "~/server/db";
import { makeAuthGateway } from "~/infrastructure/factories/auth-factory";
import { getProcessingOptions } from "~/application/services/processing-options.service";
import { CreateProjectClient } from "~/components/dashboard/create-project-client";
import { redirect } from "next/navigation";

export default async function EditProjectPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const userId = await makeAuthGateway().getUserId();
  if (!userId) redirect("/login");

  const project = await db.uploadedFile.findUnique({
    where: { id, userId },
  });

  if (!project) redirect("/dashboard");

  const options = await getProcessingOptions();
  const user = await db.user.findUnique({ where: { id: userId }, select: { credits: true } });

  const initialMetadata = {
    title: project.displayName || "Projeto",
    durationSeconds: project.durationSeconds || 300,
    thumbnailUrl: project.thumbnailUrl || undefined,
  };

  const initialSettings = {
    preset: project.subtitlePreset || "HORMOZI",
    // "" (não um literal "Auto"/"auto") quando o projeto não tem gênero
    // salvo: deixa o componente cair no próprio default de `options.GENRE`
    // (`getDefaultOptionValue`, que resolve para a opção `isDefault: true`
    // no banco, ex. "outros"). Um literal fixo aqui não bateria com nenhum
    // `<option>` real e deixaria o `<select>` sem seleção visível.
    genre: project.genre || "",
    autoZoom: project.autoZoom ?? true,
    sliceStartTime: project.sliceStartTime,
    sliceEndTime: project.sliceEndTime,
  };

  return (
    <div className="flex-1 w-full flex flex-col p-8 pt-6">
      <CreateProjectClient 
        userCredits={user?.credits || 0} 
        options={options}
        isConfigRoute={true}
        initialMetadata={initialMetadata}
        initialUrl={project.youtubeUrl || ""}
        editMode={true}
        editProjectId={project.id}
        initialSettings={initialSettings}
      />
    </div>
  );
}
