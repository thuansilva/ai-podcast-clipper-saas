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
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
