import { z } from 'zod';

// Common schemas
export const EchoInputSchema = z.object({
  message: z.string().min(1).describe('Message to echo back'),
  uppercase: z.boolean().optional().default(false).describe('Convert to uppercase'),
});

export const CalculatorInputSchema = z.object({
  operation: z.enum(['add', 'subtract', 'multiply', 'divide']).describe('Math operation'),
  a: z.number().describe('First number'),
  b: z.number().describe('Second number'),
});

export const FetchInputSchema = z.object({
  url: z.string().url().describe('URL to fetch'),
  method: z.enum(['GET', 'POST']).optional().default('GET'),
  headers: z.record(z.string()).optional().describe('Optional headers'),
});

export type EchoInput = z.infer<typeof EchoInputSchema>;
export type CalculatorInput = z.infer<typeof CalculatorInputSchema>;
export type FetchInput = z.infer<typeof FetchInputSchema>;
