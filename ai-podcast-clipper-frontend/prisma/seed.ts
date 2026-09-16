import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database with test users for load testing and local dev...");

  const usersToSeed = [
    {
      id: "user_test_default",
      email: "test@example.com",
      name: "Test User",
      password: "password123",
      credits: 50,
      stripeCustomerId: "cus_test",
    },
    ...Array.from({ length: 10 }, (_, i) => ({
      id: `user_load_${i + 1}`,
      email: `load_user_${i + 1}@example.com`,
      name: `Load User ${i + 1}`,
      password: "password123",
      credits: 100,
      stripeCustomerId: `cus_load_${i + 1}`,
    })),
    ...Array.from({ length: 10 }, (_, i) => ({
      id: `user_main_${i + 1}`,
      email: `main_user_${i + 1}@example.com`,
      name: `Main User ${i + 1}`,
      password: "password123",
      credits: 100,
      stripeCustomerId: `cus_main_${i + 1}`,
    })),
  ];

  for (const user of usersToSeed) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: {
        stripeCustomerId: user.stripeCustomerId,
        credits: user.credits,
      },
      create: user,
    });
  }
  console.log(`✅ Seeded ${usersToSeed.length} users successfully.`);

  console.log("Seeding Processing Options...");

  const processingOptions = [
    // Gêneros (GENRE)
    { type: "GENRE", value: "humor", label: "Humor", order: 1, isDefault: false },
    { type: "GENRE", value: "perguntas", label: "Perguntas", order: 2, isDefault: false },
    { type: "GENRE", value: "jogos", label: "Jogos", order: 3, isDefault: false },
    { type: "GENRE", value: "outros", label: "Outros (Padrão)", order: 4, isDefault: true },

    // Proporções (ASPECT_RATIO)
    { type: "ASPECT_RATIO", value: "9:16", label: "9:16 (TikTok/Reels/Shorts)", order: 1, isDefault: true },
    { type: "ASPECT_RATIO", value: "1:1", label: "1:1 (Quadrado/Feed)", order: 2, isDefault: false },
    { type: "ASPECT_RATIO", value: "16:9", label: "16:9 (YouTube Padrão)", order: 3, isDefault: false },
    { type: "ASPECT_RATIO", value: "4:5", label: "4:5 (Instagram Portrait)", order: 4, isDefault: false },

    // Modelo de Clipe (CLIP_MODEL)
    { type: "CLIP_MODEL", value: "auto", label: "Padrão (Auto)", order: 1, isDefault: true },
    { type: "CLIP_MODEL", value: "face_focus", label: "Foco no Rosto", order: 2, isDefault: false },
  ];

  // Limpa as opções antigas para evitar duplicidade e recria
  await prisma.processingOption.deleteMany({});
  for (const opt of processingOptions) {
    await prisma.processingOption.create({ data: opt });
  }

  console.log(`✅ Seeded ${processingOptions.length} processing options successfully.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
