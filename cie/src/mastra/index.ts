import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { LibSQLStore } from '@mastra/libsql';
import { DuckDBStore } from '@mastra/duckdb';
import { MastraCompositeStore } from '@mastra/core/storage';
import {
  Observability,
  MastraStorageExporter,
  MastraPlatformExporter,
  SensitiveDataFilter,
} from '@mastra/observability';
import { weatherWorkflow } from './workflows/weather-workflow';
import { weatherAgent } from './agents/weather-agent';
import { copilot } from './agents/copilot-agent';
import { theoAgent } from './agents/theo-agent';
import { nikoAgent } from './agents/niko-agent';
import { mayaAgent } from './agents/maya-agent';
import { testCriteriaAgent } from './agents/test-criteria-agent';
import { testEvaluatorAgent } from './agents/test-evaluator-agent';
import { diagnoseAgent } from './agents/diagnose-agent';
import { taskSuccessEvaluatorAgent } from './agents/task-success-evaluator-agent';
import { toolUseEvaluatorAgent } from './agents/tool-use-evaluator-agent';
import { contextEvaluatorAgent } from './agents/context-evaluator-agent';
import { safetyRecoveryEvaluatorAgent } from './agents/safety-recovery-evaluator-agent';
import { freeAgentEvaluatorAgent } from './agents/free-agent-evaluator-agent';
import { promptIssueEvaluatorAgent } from './agents/prompt-issue-evaluator-agent';

export const mastra = new Mastra({
  workflows: { weatherWorkflow },
  agents: {
    weatherAgent,
    copilot,
    theoAgent,
    nikoAgent,
    mayaAgent,
    testCriteriaAgent,
    testEvaluatorAgent,
    diagnoseAgent,
    taskSuccessEvaluatorAgent,
    toolUseEvaluatorAgent,
    contextEvaluatorAgent,
    safetyRecoveryEvaluatorAgent,
    freeAgentEvaluatorAgent,
    promptIssueEvaluatorAgent,
  },
  storage: new MastraCompositeStore({
    id: 'composite-storage',
    default: new LibSQLStore({
      id: 'mastra-storage',
      // Uses a hosted database when deployed (mastra env db create --kind turso),
      // and a local file during development.
      url: process.env.TURSO_DATABASE_URL ?? 'file:./mastra.db',
      authToken: process.env.TURSO_AUTH_TOKEN,
    }),
    domains: {
      observability: new DuckDBStore().observability,
    },
  }),
  logger: new PinoLogger({
    name: 'Mastra',
    level: 'info',
  }),
  observability: new Observability({
    configs: {
      default: {
        serviceName: 'mastra',
        exporters: [
          new MastraStorageExporter(), // Persists observability events to Mastra Storage
          new MastraPlatformExporter(), // Sends observability events to Mastra Platform (if MASTRA_PLATFORM_ACCESS_TOKEN is set)
        ],
        spanOutputProcessors: [
          new SensitiveDataFilter(), // Redacts sensitive data like passwords, tokens, keys
        ],
      },
    },
  }),
});

export {
  copilot,
  theoAgent,
  nikoAgent,
  mayaAgent,
  testCriteriaAgent,
  testEvaluatorAgent,
  diagnoseAgent,
  taskSuccessEvaluatorAgent,
  toolUseEvaluatorAgent,
  contextEvaluatorAgent,
  safetyRecoveryEvaluatorAgent,
  freeAgentEvaluatorAgent,
  promptIssueEvaluatorAgent,
};
