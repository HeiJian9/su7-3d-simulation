import {z} from 'zod';
import {vehicleStateSchema,vehicleCommandSchema} from './vehicle.js';
import {assistantReplySchema} from './capabilities.js';
export const assistantInputSchema=z.object({requestId:z.string().min(1).max(128),text:z.string().trim().min(1).max(2000),state:vehicleStateSchema,actual:z.record(z.string(),z.union([z.number().finite(),z.string(),z.boolean()])).default({}),available:z.array(z.string().max(80)).max(40),context:z.object({focus:z.object({component:z.string().max(30),targets:z.array(z.string().max(30)).max(4),updatedAt:z.number()}).optional(),pending:z.object({text:z.string().max(2000),question:z.string().max(200),expiresAt:z.number()}).optional(),history:z.array(z.object({input:z.string().max(2000),output:z.string().max(2000)})).max(10)}).strict()}).strict();
export type AssistantInput=z.infer<typeof assistantInputSchema>;
export const toolCallSchema=z.object({id:z.string().min(1).max(200),index:z.number().int().nonnegative().optional(),type:z.literal('function'),function:z.object({name:z.string().min(1).max(80),arguments:z.string().max(24000)}).strict()}).strict();
export type ToolCall=z.infer<typeof toolCallSchema>;
export const assistantPlanSchema=z.object({requestId:z.string(),turnId:z.string(),model:z.string(),calls:z.array(toolCallSchema).min(1).max(16),commands:z.array(vehicleCommandSchema).max(16),reply:assistantReplySchema.optional(),baseRevision:z.number().int(),durationMs:z.number(),validationRepairs:z.number().int().max(1).optional()}).strict();
export type AssistantPlan=z.infer<typeof assistantPlanSchema>;
const effectSchema=z.object({key:z.string(),value:z.union([z.number().finite(),z.string(),z.boolean()])}).strict();
export const toolReceiptSchema=z.object({tool_call_id:z.string(),status:z.enum(['completed','failed','superseded']),message:z.string().max(2000),revision:z.number().int().nonnegative(),effects:z.array(effectSchema).max(80),observations:z.array(z.object({index:z.number().int(),effects:z.array(effectSchema)})).max(16).optional()}).strict();
export const assistantFinishSchema=z.object({turnId:z.string(),requestId:z.string(),results:z.array(toolReceiptSchema).min(1).max(16)}).strict();
// Rules still execute locally; this receipt only permits wording after completion.
export const assistantFeedbackSchema=z.object({input:assistantInputSchema,commands:z.array(vehicleCommandSchema).min(1).max(16),result:z.object({status:z.literal('completed'),revision:z.number().int().nonnegative(),effects:z.array(effectSchema).max(80),boundary:z.boolean()}).strict()}).strict();
export interface IntentHealth {configured:boolean;model:string;protocol:string;missing:string[];probe:string}
