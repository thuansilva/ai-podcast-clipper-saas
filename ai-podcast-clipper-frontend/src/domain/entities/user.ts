import { InsufficientCreditsError } from "../errors/insufficient-credits-error";
import { DomainError } from "../errors/domain-error";
import {
  NORMAL_MAX_DURATION_SECONDS,
  STUDIO_MAX_DURATION_SECONDS,
} from "../rules/video-limits";
import { calculateVideoCredits } from "../rules/calculate-credits";

export interface UserEntity {
  id: string;
  name?: string | null;
  email: string;
  credits: number;
  reservedCredits: number;
  stripeCustomerId?: string | null;
  image?: string | null;
  plan?: string;
}

export type UserPlan = "STARTER" | "STUDIO";

export interface CreateUserInput {
  id: string;
  email: string;
  name?: string | null;
  image?: string | null;
  stripeCustomerId?: string | null;
}

export class User {
  private _credits: number;
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
    credits = 10,
    reservedCredits = 0,
    plan = "STARTER",
    name?: string | null,
    image?: string | null,
    stripeCustomerId?: string | null
  ) {
    if (credits < 0) {
      throw new DomainError("O saldo de créditos não pode ser negativo.");
    }
    if (reservedCredits < 0) {
      throw new DomainError("O saldo de créditos reservados não pode ser negativo.");
    }

    this._credits = credits;
    this._reservedCredits = reservedCredits;
    this._plan = plan?.toUpperCase() === "STUDIO" ? "STUDIO" : "STARTER";
    this._name = name;
    this._image = image;
    this._stripeCustomerId = stripeCustomerId;
  }

  /**
   * Factory para criar um novo usuário no sistema (aplica defaults e regras de inicialização)
   */
  public static create(input: CreateUserInput): User {
    return new User(
      input.id,
      input.email,
      10, // créditos padrão de boas-vindas
      0,  // sem créditos reservados inicialmente
      "STARTER",
      input.name,
      input.image,
      input.stripeCustomerId
    );
  }

  /**
   * Factory para reconstituir uma entidade existente a partir do banco de dados / repositório
   */
  public static restore(data: UserEntity): User {
    return new User(
      data.id,
      data.email,
      data.credits,
      data.reservedCredits,
      data.plan,
      data.name,
      data.image,
      data.stripeCustomerId
    );
  }

  // Getters
  get credits(): number {
    return this._credits;
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
   * Invariante de negócio: Reter créditos para processamento
   */
  public holdCredits(amount: number): void {
    if (amount <= 0) {
      throw new DomainError("A quantidade de créditos a reter deve ser maior que zero.");
    }
    if (this._credits < amount) {
      throw new InsufficientCreditsError(amount, this._credits);
    }
    this._credits -= amount;
    this._reservedCredits += amount;
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
  public refundCredits(amount: number): void {
    if (amount <= 0) {
      throw new DomainError("A quantidade de créditos a estornar deve ser maior que zero.");
    }
    const actualRefund = Math.min(amount, this._reservedCredits);
    this._reservedCredits -= actualRefund;
    this._credits += actualRefund;
  }

  /**
   * Invariante de negócio: Adicionar novos créditos
   */
  public addCredits(amount: number): void {
    if (amount <= 0) {
      throw new DomainError("A quantidade de créditos a adicionar deve ser maior que zero.");
    }
    this._credits += amount;
  }

  /**
   * Atualização de plano
   */
  public upgradePlan(newPlan: string): void {
    this._plan = newPlan?.toUpperCase() === "STUDIO" ? "STUDIO" : "STARTER";
  }

  /**
   * Regra de teto máximo de duração por plano
   */
  public maxVideoDurationAllowed(): number {
    return this._plan === "STUDIO"
      ? STUDIO_MAX_DURATION_SECONDS
      : NORMAL_MAX_DURATION_SECONDS;
  }

  public canProcessDuration(durationSeconds: number): boolean {
    return durationSeconds <= this.maxVideoDurationAllowed();
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
      reservedCredits: this._reservedCredits,
      plan: this._plan,
      name: this._name,
      image: this._image,
      stripeCustomerId: this._stripeCustomerId,
    };
  }
}
