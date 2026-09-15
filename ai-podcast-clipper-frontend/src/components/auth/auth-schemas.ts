import { z } from "zod";

export const signInSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "O email é obrigatório.")
    .email("Formato de email inválido.")
    .max(255, "O email não pode ultrapassar 255 caracteres."),
  password: z
    .string()
    .min(15, "A senha deve conter no mínimo 15 caracteres.")
    .max(72, "A senha não pode ultrapassar 72 caracteres."),
});

export type SignInInput = z.infer<typeof signInSchema>;

export const signUpSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "O email é obrigatório.")
    .email("Formato de email inválido.")
    .max(255, "O email não pode ultrapassar 255 caracteres."),
  password: z
    .string()
    .min(15, "A senha deve conter no mínimo 15 caracteres.")
    .max(72, "A senha não pode ultrapassar 72 caracteres."),
});

export type SignUpInput = z.infer<typeof signUpSchema>;

export const verifyCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .length(6, "O código de verificação deve conter exatamente 6 dígitos.")
    .regex(/^\d{6}$/, "O código deve conter apenas números."),
});

export type VerifyCodeInput = z.infer<typeof verifyCodeSchema>;
