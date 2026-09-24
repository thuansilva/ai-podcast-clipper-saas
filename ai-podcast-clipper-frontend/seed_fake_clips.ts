import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding fake clips to the latest project...');
  
  // Get any user
  const user = await prisma.user.findFirst();
  
  if (!user) {
    console.log('No user found! Please sign up first.');
    process.exit(1);
  }

  // Find the latest project (UploadedFile)
  const latestProject = await prisma.uploadedFile.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
  });

  if (!latestProject) {
    console.log('No project found for the user! Please create a project first.');
    process.exit(1);
  }

  const fakeClips = [
    {
      s3Key: 'fake-key-1',
      title: 'Segredo Revelado: Canhão de Ganha Pão Explicado!',
      hook: 'Como fazer seu negócio explodir no próximo mês usando essa técnica...',
      viralityScore: 99,
      reason: 'Tem um gancho muito forte no começo e retém a atenção até o fim.',
      durationSeconds: 20.5,
      subtitlePreset: 'HORMOZI',
      layoutMode: 'SMART_CROP',
      userId: user.id,
      uploadedFileId: latestProject.id,
    },
    {
      s3Key: 'fake-key-2',
      title: 'Surpresa de Direção: Isadora Assume o Volante!',
      hook: 'Olha o que aconteceu quando ela tentou dirigir pela primeira vez...',
      viralityScore: 96,
      reason: 'Situação inusitada com alta retenção devido ao suspense.',
      durationSeconds: 18.2,
      subtitlePreset: 'HORMOZI',
      layoutMode: 'SMART_CROP',
      userId: user.id,
      uploadedFileId: latestProject.id,
    },
    {
      s3Key: 'fake-key-3',
      title: 'Kauan, 22: Um Cara de Boa e Maneiro',
      hook: 'Você não vai acreditar no estilo de vida que ele leva aos 22...',
      viralityScore: 92,
      reason: 'Gera identificação com o público jovem.',
      durationSeconds: 27.0,
      subtitlePreset: 'HORMOZI',
      layoutMode: 'SMART_CROP',
      userId: user.id,
      uploadedFileId: latestProject.id,
    },
    {
      s3Key: 'fake-key-4',
      title: 'O Que Realmente Importa em um Relacionamento?',
      hook: 'Esqueça tudo o que te falaram sobre namoro. O que importa é isso...',
      viralityScore: 89,
      reason: 'Tópico universal (relacionamentos) gera muitos comentários.',
      durationSeconds: 23.0,
      subtitlePreset: 'HORMOZI',
      layoutMode: 'SMART_CROP',
      userId: user.id,
      uploadedFileId: latestProject.id,
    },
    {
      s3Key: 'fake-key-5',
      title: 'Relacionamento é Prisão? Ou Liberdade?',
      hook: 'Se você se sente preso na sua relação, precisa ouvir isso.',
      viralityScore: 85,
      reason: 'Polariza opiniões, excelente para engajamento nos comentários.',
      durationSeconds: 39.5,
      subtitlePreset: 'HORMOZI',
      layoutMode: 'SMART_CROP',
      userId: user.id,
      uploadedFileId: latestProject.id,
    }
  ];

  for (const clip of fakeClips) {
    await prisma.clip.create({
      data: clip,
    });
  }

  console.log(`Successfully created ${fakeClips.length} fake clips for project ${latestProject.id} (user ${user.email})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
