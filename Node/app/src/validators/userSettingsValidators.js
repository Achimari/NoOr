import { z } from "zod";

export const nicknameSchema = z.object({
  name: z.string().trim().min(2, "Nickname must contain at least 2 characters").max(120),
});

export const passwordChangeSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required").max(256),
    password: z.string().min(8, "New password must contain at least 8 characters").max(256),
    passwordConfirmation: z.string().max(256).optional(),
  })
  .refine((data) => !data.passwordConfirmation || data.password === data.passwordConfirmation, {
    message: "Passwords do not match",
    path: ["passwordConfirmation"],
  });
