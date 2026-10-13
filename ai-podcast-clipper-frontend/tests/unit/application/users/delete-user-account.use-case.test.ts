import { describe, it, expect, vi, beforeEach } from "vitest";
import { DeleteUserAccountUseCase } from "~/application/use-cases/users/delete-user-account.use-case";
import { ExpireSubscriptionUseCase } from "~/application/use-cases/credits/expire-subscription.use-case";
import { CancelUserSubscriptionUseCase } from "~/application/use-cases/credits/cancel-user-subscription.use-case";
import { InMemoryUserRepository } from "../../../mocks/in-memory-user-repository";
import { InMemorySubscriptionRepository } from "../../../mocks/in-memory-subscription-repository";
import { InMemoryUploadedFileRepository } from "../../../mocks/in-memory-uploaded-file-repository";
import { InMemoryClipRepository } from "../../../mocks/in-memory-clip-repository";
import { InMemoryStorageGateway } from "../../../mocks/in-memory-storage-gateway";
import { InMemoryUnitOfWork } from "../../../mocks/in-memory-unit-of-work";
import type { IPaymentGateway } from "~/domain/ports/payment-gateway";

describe("DeleteUserAccountUseCase", () => {
  let userRepo: InMemoryUserRepository;
  let subscriptionRepo: InMemorySubscriptionRepository;
  let uploadedFileRepo: InMemoryUploadedFileRepository;
  let clipRepo: InMemoryClipRepository;
  let storageGateway: InMemoryStorageGateway;
  let uow: InMemoryUnitOfWork;
  let paymentGateway: IPaymentGateway;
  let expireSubscriptionUseCase: ExpireSubscriptionUseCase;
  let cancelUserSubscriptionUseCase: CancelUserSubscriptionUseCase;
  let useCase: DeleteUserAccountUseCase;

  beforeEach(() => {
    userRepo = new InMemoryUserRepository();
    subscriptionRepo = new InMemorySubscriptionRepository();
    uploadedFileRepo = new InMemoryUploadedFileRepository();
    clipRepo = new InMemoryClipRepository();
    storageGateway = new InMemoryStorageGateway();
    uow = new InMemoryUnitOfWork();

    paymentGateway = {
      createCheckoutSession: vi.fn(),
      createBillingPortalSession: vi.fn(),
      createCustomer: vi.fn(),
      cancelSubscription: vi.fn().mockResolvedValue(undefined),
    };

    expireSubscriptionUseCase = new ExpireSubscriptionUseCase(
      userRepo,
      uow,
      subscriptionRepo
    );

    cancelUserSubscriptionUseCase = new CancelUserSubscriptionUseCase(
      subscriptionRepo,
      paymentGateway,
      expireSubscriptionUseCase
    );

    useCase = new DeleteUserAccountUseCase(
      userRepo,
      uploadedFileRepo,
      clipRepo,
      storageGateway,
      uow,
      cancelUserSubscriptionUseCase
    );
  });

  it("usuário inexistente: não lança erro e não chama nenhuma dependência de rede", async () => {
    await expect(
      useCase.execute({ userId: "user_does_not_exist" })
    ).resolves.toBeUndefined();

    expect(paymentGateway.cancelSubscription).not.toHaveBeenCalled();
  });

  it("assinatura ativa: cancela no Stripe e atualiza o status para 'canceled' no banco", async () => {
    await userRepo.create({
      id: "user_with_sub",
      email: "comassinatura@test.com",
      credits: 100,
      subscriptionCredits: 80,
      oneTimeCredits: 20,
    });

    await subscriptionRepo.upsert({
      userId: "user_with_sub",
      stripeSubscriptionId: "sub_active_1",
      stripePriceId: "price_pro_monthly",
      status: "active",
      plan: "PRO",
      monthlyCredits: 300,
      currentPeriodStart: new Date("2026-09-01"),
      currentPeriodEnd: new Date("2026-10-01"),
    });

    await useCase.execute({ userId: "user_with_sub" });

    expect(paymentGateway.cancelSubscription).toHaveBeenCalledWith(
      "sub_active_1"
    );

    const sub = await subscriptionRepo.findByStripeSubscriptionId(
      "sub_active_1"
    );
    expect(sub?.status).toBe("canceled");
  });

  it("sem assinatura: não chama o Stripe", async () => {
    await userRepo.create({
      id: "user_no_sub",
      email: "semassinatura@test.com",
      credits: 10,
    });

    await useCase.execute({ userId: "user_no_sub" });

    expect(paymentGateway.cancelSubscription).not.toHaveBeenCalled();
  });

  it("assinatura já cancelada: não chama o Stripe de novo", async () => {
    await userRepo.create({
      id: "user_already_canceled",
      email: "jacancelada@test.com",
      credits: 10,
    });

    await subscriptionRepo.upsert({
      userId: "user_already_canceled",
      stripeSubscriptionId: "sub_already_canceled_1",
      stripePriceId: "price_starter_monthly",
      status: "canceled",
      plan: "STARTER",
      monthlyCredits: 150,
      currentPeriodStart: new Date("2026-09-01"),
      currentPeriodEnd: new Date("2026-10-01"),
    });

    await useCase.execute({ userId: "user_already_canceled" });

    expect(paymentGateway.cancelSubscription).not.toHaveBeenCalled();
  });

  it("deleta arquivos do storage antes de remover as linhas do banco", async () => {
    const deletionOrder: string[] = [];
    const originalDeleteFile = storageGateway.deleteFile.bind(storageGateway);
    storageGateway.deleteFile = vi.fn(async (key: string) => {
      deletionOrder.push(`storage:${key}`);
      await originalDeleteFile(key);
    });

    const originalFileDelete = uploadedFileRepo.delete.bind(uploadedFileRepo);
    uploadedFileRepo.delete = vi.fn(async (id: string) => {
      deletionOrder.push(`db:file:${id}`);
      await originalFileDelete(id);
    });

    await userRepo.create({
      id: "user_with_files",
      email: "comarquivos@test.com",
      credits: 10,
    });

    const file = await uploadedFileRepo.create({
      userId: "user_with_files",
      s3Key: "uploads/video.mp4",
      sourceType: "YOUTUBE",
    });

    await clipRepo.createMany([
      {
        userId: "user_with_files",
        uploadedFileId: file.id,
        s3Key: "clips/clip-1.mp4",
        title: "Clip 1",
        startTime: 0,
        endTime: 10,
        durationSeconds: 10,
      },
    ]);

    await useCase.execute({ userId: "user_with_files" });

    expect(storageGateway.deletedKeys).toContain("uploads/video.mp4");
    expect(storageGateway.deletedKeys).toContain("clips/clip-1.mp4");

    expect(await uploadedFileRepo.findById(file.id)).toBeNull();
    expect(await clipRepo.findByUserId("user_with_files")).toHaveLength(0);

    const storageIndex = deletionOrder.indexOf("storage:uploads/video.mp4");
    const dbIndex = deletionOrder.indexOf(`db:file:${file.id}`);
    expect(storageIndex).toBeGreaterThanOrEqual(0);
    expect(dbIndex).toBeGreaterThan(storageIndex);
  });

  it("usuário sem UploadedFile/Clip: apenas anonimiza o cadastro", async () => {
    await userRepo.create({
      id: "user_no_files",
      email: "semarquivos@test.com",
      name: "Nome Real",
      image: "https://avatar.png",
      credits: 10,
    });

    await useCase.execute({ userId: "user_no_files" });

    expect(storageGateway.deletedKeys).toHaveLength(0);

    const user = await userRepo.findById("user_no_files");
    expect(user).not.toBeNull();
    expect(user?.email).toBe("deleted-user_no_files@anon.local");
    expect(user?.name).toBeNull();
    expect(user?.image).toBeNull();
  });

  it("anonimiza o usuário em vez de apagar a linha (db.user.delete nunca é chamado)", async () => {
    const deleteSpy = vi.fn();
    // O repositório em memória não tem um método `delete()` de usuário —
    // reflete o contrato real: IUserRepository não expõe delete().
    expect((userRepo as unknown as { delete?: unknown }).delete).toBeUndefined();

    await userRepo.create({
      id: "user_to_anonymize",
      email: "real@test.com",
      name: "Nome Real",
      credits: 5,
    });

    await useCase.execute({ userId: "user_to_anonymize" });

    const user = await userRepo.findById("user_to_anonymize");
    expect(user).not.toBeNull();
    expect(user?.email).toBe("deleted-user_to_anonymize@anon.local");
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it("Stripe cancelSubscription falha: propaga o erro e não anonimiza o usuário", async () => {
    paymentGateway.cancelSubscription = vi
      .fn()
      .mockRejectedValue(new Error("Stripe indisponível"));

    await userRepo.create({
      id: "user_stripe_error",
      email: "erro@test.com",
      credits: 10,
    });

    await subscriptionRepo.upsert({
      userId: "user_stripe_error",
      stripeSubscriptionId: "sub_error_1",
      stripePriceId: "price_pro_monthly",
      status: "active",
      plan: "PRO",
      monthlyCredits: 300,
      currentPeriodStart: new Date("2026-09-01"),
      currentPeriodEnd: new Date("2026-10-01"),
    });

    await expect(
      useCase.execute({ userId: "user_stripe_error" })
    ).rejects.toThrow("Stripe indisponível");

    const user = await userRepo.findById("user_stripe_error");
    expect(user?.email).toBe("erro@test.com");
  });
});
