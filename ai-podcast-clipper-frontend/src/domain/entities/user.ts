import { InsufficientCreditsError } from "../errors/insufficient-credits-error";
import { DomainError } from "../errors/domain-error";
import {
  PlanPolicyService,
  type VideoDurationValidationResult,
} from "../services/plan-policy.service";
import { calculateVideoCredits } from "../services/credit-pricing.service";

export interface UserEntity {
  id: string;
  name?: string | null;
  email: string;
  credits: number;
  subscriptionCredits?: number;
  oneTimeCredits?: number;
  reservedCredits: number;
  stripeCustomerId?: string | null;
  image?: string | null;
  plan?: string;
}

export type UserPlan = "STARTER" | "STUDIO" | "CREATOR" | "PRO_STUDIO";

export interface CreateUserInput {
  id: string;
  email: string;
  name?: string | null;
  image?: string | null;
  stripeCustomerId?: string | null;
  subscriptionCredits?: number;
  oneTimeCredits?: number;
  plan?: string;
}

export interface DeductCreditsResult {
  debitedSubscription: number;
  debitedOneTime: number;
}

export class User {
  private _credits: number;
  private _subscriptionCredits: number;
  private _oneTimeCredits: number;
  private _reservedCredits: number;
  private _plan: UserPlan;
  private _name?: string | null;
  private _image?: string | null;
  private _stripeCustomerId?: string | null;

  /**
   * Construtor privado: impede instanciações descontroladas ou fora de factories
   */
  private constructor(
    public readonly id: string,
    public readonly email: string,
    subscriptionCredits = 0,
    oneTimeCredits = 10,
    reservedCredits = 0,
    plan = "STARTER",
    name?: string | null,
    image?: string | null,
    stripeCustomerId?: string | null,
    credits?: number
  ) {
    if (subscriptionCredits < 0) {
      throw new DomainError("O saldo de créditos de assinatura não pode ser negativo.");
    }
    if (oneTimeCredits < 0) {
      throw new DomainError("O saldo de créditos avulsos não pode ser negativo.");
    }
    if (reservedCredits < 0) {
      throw new DomainError("O saldo de créditos reservados não pode ser negativo.");
    }

    this._subscriptionCredits = subscriptionCredits;
    this._oneTimeCredits = oneTimeCredits;

    const derivedCredits = subscriptionCredits + oneTimeCredits;
    this._credits = credits ?? derivedCredits;

    if (this._credits < 0) {
      throw new DomainError("O saldo de créditos não pode ser negativo.");
    }

    const upperPlan = plan?.trim().toUpperCase();
    if (upperPlan === "STUDIO" || upperPlan === "PRO_STUDIO" || upperPlan === "CREATOR") {
      this._plan = upperPlan as UserPlan;
    } else {
      this._plan = "STARTER";
    }

    this._reservedCredits = reservedCredits;
    this._name = name;
    this._image = image;
    this._stripeCustomerId = stripeCustomerId;
  }

  /**
   * Factory para criar um novo usuário no sistema (aplica defaults e regras de inicialização)
   */
  public static create(input: CreateUserInput): User {
    const subCredits = input.subscriptionCredits ?? 0;
    const otCredits = input.oneTimeCredits ?? 10;
    return new User(
      input.id,
      input.email,
      subCredits,
      otCredits,
      0, // sem créditos reservados inicialmente
      input.plan ?? "STARTER",
      input.name,
      input.image,
      input.stripeCustomerId,
      subCredits + otCredits
    );
  }

  /**
   * Factory para reconstituir uma entidade existente a partir do banco de dados / repositório
   */
  public static restore(data: UserEntity): User {
    let subCredits = data.subscriptionCredits;
    let otCredits = data.oneTimeCredits;

    if (subCredits === undefined && otCredits === undefined) {
      subCredits = 0;
      otCredits = data.credits;
    } else {
      subCredits = subCredits ?? 0;
      otCredits =
        otCredits ?? (data.credits !== undefined ? Math.max(0, data.credits - subCredits) : 0);
    }

    return new User(
      data.id,
      data.email,
      subCredits,
      otCredits,
      data.reservedCredits,
      data.plan,
      data.name,
      data.image,
      data.stripeCustomerId,
      data.credits ?? (subCredits + otCredits)
    );
  }

  /**
   * Factory para instanciar usuário transiente em memória (ex: orçamentos e validações no frontend)
   */
  public static createTransient(input: {
    credits?: number;
    plan?: string;
  }): User {
    const credits = Math.max(0, input.credits ?? 0);
    const normalizedPlan = (input.plan?.trim().toUpperCase() as UserPlan) || "STARTER";
    return new User(
      "transient-user",
      "transient@preview.local",
      credits,
      0,
      0,
      normalizedPlan,
      null,
      null,
      null,
      credits
    );
  }

  // Getters
  get credits(): number {
    return this._credits;
  }

  get subscriptionCredits(): number {
    return this._subscriptionCredits;
  }

  get oneTimeCredits(): number {
    return this._oneTimeCredits;
  }

  get reservedCredits(): number {
    return this._reservedCredits;
  }

  get plan(): UserPlan {
    return this._plan;
  }

  get name(): string | null | undefined {
    return this._name;
  }

  get image(): string | null | undefined {
    return this._image;
  }

  get stripeCustomerId(): string | null | undefined {
    return this._stripeCustomerId;
  }

  /**
   * Verifica se o usuário possui saldo total suficiente para cobrir um custo
   */
  public hasSufficientCredits(amount: number): boolean {
    return this._credits >= amount;
  }

  /**
   * Invariante de negócio: Dedução prioritária de créditos.
   * Consome prioritariamente da cota mensal (subscriptionCredits) e, se insuficiente,
   * consome o saldo restante de créditos avulsos (oneTimeCredits).
   */
  public deductCreditsPrioritized(amount: number): DeductCreditsResult {
    if (amount <= 0) {
      throw new DomainError("A quantidade de créditos a deduzir deve ser maior que zero.");
    }
    if (this._credits < amount) {
      throw new InsufficientCreditsError(amount, this._credits);
    }

    const debitedSubscription = Math.min(amount, this._subscriptionCredits);
    const remaining = amount - debitedSubscription;
    const debitedOneTime = Math.min(remaining, this._oneTimeCredits);

    this._subscriptionCredits -= debitedSubscription;
    this._oneTimeCredits -= debitedOneTime;
    this._credits = this._subscriptionCredits + this._oneTimeCredits;

    return { debitedSubscription, debitedOneTime };
  }

  /**
   * Invariante de negócio: Reter créditos para processamento
   */
  public holdCredits(amount: number): DeductCreditsResult {
    if (amount <= 0) {
      throw new DomainError("A quantidade de créditos a reter deve ser maior que zero.");
    }
    if (this._credits < amount) {
      throw new InsufficientCreditsError(amount, this._credits);
    }
    const result = this.deductCreditsPrioritized(amount);
    this._reservedCredits += amount;
    return result;
  }

  /**
   * Invariante de negócio: Consumir créditos previamente retidos
   */
  public consumeCredits(amount: number): void {
    if (amount <= 0) {
      throw new DomainError("A quantidade de créditos a consumir deve ser maior que zero.");
    }
    if (amount > this._reservedCredits) {
      throw new DomainError(
        `Não é possível consumir ${amount} créditos. Apenas ${this._reservedCredits} estão retidos.`
      );
    }
    this._reservedCredits -= amount;
  }

  /**
   * Invariante de negócio: Estornar créditos retidos de volta ao saldo disponível
   */
  public refundCredits(
    amount: number,
    breakdown?: { subscriptionCredits?: number; oneTimeCredits?: number }
  ): { refundedSubscription: number; refundedOneTime: number } {
    if (amount <= 0) {
      throw new DomainError("A quantidade de créditos a estornar deve ser maior que zero.");
    }
    const actualRefund = Math.min(amount, this._reservedCredits);
    this._reservedCredits -= actualRefund;

    let refundedSubscription = 0;
    let refundedOneTime = 0;

    if (breakdown) {
      refundedSubscription = Math.min(actualRefund, breakdown.subscriptionCredits ?? 0);
      refundedOneTime = actualRefund - refundedSubscription;
    } else {
      const monthlyQuota =
        this._plan === "PRO_STUDIO" || this._plan === "STUDIO"
          ? 500
          : this._plan === "CREATOR"
            ? 150
            : 0;
      const headroom = Math.max(0, monthlyQuota - this._subscriptionCredits);
      refundedSubscription = Math.min(actualRefund, headroom);
      refundedOneTime = actualRefund - refundedSubscription;
    }

    this._subscriptionCredits += refundedSubscription;
    this._oneTimeCredits += refundedOneTime;
    this._credits = this._subscriptionCredits + this._oneTimeCredits;

    return { refundedSubscription, refundedOneTime };
  }

  /**
   * Invariante de negócio: Adicionar novos créditos avulsos
   */
  public addCredits(amount: number): void {
    if (amount <= 0) {
      throw new DomainError("A quantidade de créditos a adicionar deve ser maior que zero.");
    }
    this._oneTimeCredits += amount;
    this._credits = this._subscriptionCredits + this._oneTimeCredits;
  }

  /**
   * Invariante de negócio: Atualizar/Resetar cota de créditos da assinatura
   */
  public resetSubscriptionCredits(monthlyCredits: number): void {
    if (monthlyCredits < 0) {
      throw new DomainError("A cota de créditos de assinatura não pode ser negativa.");
    }
    this._subscriptionCredits = monthlyCredits;
    this._credits = this._subscriptionCredits + this._oneTimeCredits;
  }

  /**
   * Atualização de plano
   */
  public upgradePlan(newPlan: string): void {
    const upperPlan = newPlan?.trim().toUpperCase();
    if (upperPlan === "STUDIO" || upperPlan === "PRO_STUDIO" || upperPlan === "CREATOR") {
      this._plan = upperPlan as UserPlan;
    } else {
      this._plan = "STARTER";
    }
  }

  /**
   * Expiração de assinatura: encerra plano recorrente e cota mensal
   */
  public expireSubscription(): void {
    this._subscriptionCredits = 0;
    this._plan = "STARTER";
    this._credits = this._oneTimeCredits;
  }

  /**
   * Regra de teto máximo de duração por plano
   */
  public maxVideoDurationAllowed(): number {
    return PlanPolicyService.getMaxDurationForPlan(this._plan);
  }

  public canProcessDuration(durationSeconds: number): boolean {
    return durationSeconds <= this.maxVideoDurationAllowed();
  }

  public validateVideoDuration(durationSeconds: number): VideoDurationValidationResult {
    return PlanPolicyService.validateVideoDuration(durationSeconds, this._plan);
  }

  public calculateCostForDuration(durationSeconds: number): number {
    return calculateVideoCredits(durationSeconds);
  }

  /**
   * Serialização segura para o Next.js e repositórios
   */
  public toJSON(): UserEntity {
    return {
      id: this.id,
      email: this.email,
      credits: this._credits,
      subscriptionCredits: this._subscriptionCredits,
      oneTimeCredits: this._oneTimeCredits,
      reservedCredits: this._reservedCredits,
      plan: this._plan,
      name: this._name,
      image: this._image,
      stripeCustomerId: this._stripeCustomerId,
    };
  }
}
