import { z } from "zod";

export const loginSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120).optional(),
  login: z.string().trim().min(1, "Login is required").max(120).optional(),
  password: z.string().min(1, "Password is required").max(256),
}).refine((data) => data.name || data.login, {
  message: "Name is required",
  path: ["name"],
}).transform((data) => ({
  name: data.name || data.login,
  password: data.password,
}));

export const registerSchema = z
  .object({
    name: z.string().trim().min(2, "Name must contain at least 2 characters").max(120),
    password: z.string().min(8, "Password must contain at least 8 characters").max(256),
    passwordConfirmation: z.string().max(256).optional(),
  })
  .refine((data) => !data.passwordConfirmation || data.password === data.passwordConfirmation, {
    message: "Passwords do not match",
    path: ["passwordConfirmation"],
  });
