import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  otpCode: z.string().length(6).optional().or(z.literal("")),
});

export const registerSchema = z.object({
  email: z.string().email("Invalid email address"),
  phone: z.string().min(10, "Phone must be at least 10 digits").max(20),
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

export const sendMoneySchema = z.object({
  receiverId: z.string().min(1, "Recipient is required"),
  amountCents: z.number().min(100, "Minimum is ₱1.00").max(5000000, "Maximum is ₱50,000"),
  description: z.string().max(200).optional(),
});

export const cashInSchema = z.object({
  amountCents: z.number().min(100, "Minimum is ₱1.00").max(10000000, "Maximum is ₱100,000"),
});

export const cashOutSchema = z.object({
  amountCents: z.number().min(100, "Minimum is ₱1.00").max(10000000, "Maximum is ₱100,000"),
});

export type LoginFormData = z.infer<typeof loginSchema>;
export type RegisterFormData = z.infer<typeof registerSchema>;
export type SendMoneyFormData = z.infer<typeof sendMoneySchema>;
export type CashInFormData = z.infer<typeof cashInSchema>;
export type CashOutFormData = z.infer<typeof cashOutSchema>;