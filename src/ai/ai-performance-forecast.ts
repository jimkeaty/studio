// src/ai/ai-performance-forecast.ts
'use server';
/**
 * @fileOverview A performance forecasting AI agent.
 *
 * - getPerformanceForecast - A function that handles the performance forecast process.
 * - PerformanceForecastInput - The input type for the getPerformanceForecast function.
 * - PerformanceForecastOutput - The return type for the getPerformanceForecast function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const PerformanceForecastInputSchema = z.object({
  historicalPerformanceData: z.string().describe('Historical performance data of the agent.'),
  monthlyCommitments: z.string().describe('Monthly commitments of the agent.'),
  marketTrends: z.string().describe('Current market trends.'),
  annualIncomeGoal: z.number().describe('The agent annual income goal'),
});

export type PerformanceForecastInput = z.infer<typeof PerformanceForecastInputSchema>;

const PerformanceForecastOutputSchema = z.object({
  estimatedNetIncome: z.number().describe('The estimated net income based on the provided data.'),
  requiredClosings: z.number().describe('The number of closings required to achieve the annual income goal.'),
  requiredContracts: z.number().describe('The number of contracts required to achieve the annual income goal.'),
  requiredAppointments: z.number().describe('The number of appointments required to achieve the annual income goal.'),
  requiredEngagements: z.number().describe('The number of engagements required to achieve the annual income goal.'),
  requiredCalls: z.number().describe('The number of calls required to achieve the annual income goal.'),
  planSummary: z.string().describe('A summary of the plan to achieve the annual income goal.'),
});

export type PerformanceForecastOutput = z.infer<typeof PerformanceForecastOutputSchema>;

export async function getPerformanceForecast(input: PerformanceForecastInput): Promise<PerformanceForecastOutput> {
  return performanceForecastFlow(input);
}

const performanceForecastPrompt = ai.definePrompt({
  name: 'performanceForecastPrompt',
  input: {schema: PerformanceForecastInputSchema},
  output: {schema: PerformanceForecastOutputSchema},
  prompt: `You are an AI assistant designed to provide performance forecasts for real estate agents.
  Analyze the historical performance data, monthly commitments, and market trends to provide an accurate and personalized forecast of the agent's potential net income.
  Based on the agent annual income goal, also calculate the required closings, contracts, appointments, engagements, and calls to achieve the goal.

  Historical Performance Data: {{{historicalPerformanceData}}}
  Monthly Commitments: {{{monthlyCommitments}}}
  Market Trends: {{{marketTrends}}}
  Annual Income Goal: {{{annualIncomeGoal}}}

  Provide the output in JSON format.
  Make sure to include a planSummary that includes all the required actions in order to achieve the annual income goal.
  `,
});

const performanceForecastFlow = ai.defineFlow(
  {
    name: 'performanceForecastFlow',
    inputSchema: PerformanceForecastInputSchema,
    outputSchema: PerformanceForecastOutputSchema,
  },
  async input => {
    const {output} = await performanceForecastPrompt(input);
    return output!;
  }
);
