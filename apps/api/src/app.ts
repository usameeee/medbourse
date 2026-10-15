import cors from 'cors';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import type { HealthResponse } from '@medbourse/shared';
import { config } from './config.js';
import { isDatabaseConnected } from './db/connection.js';
import { errorHandler } from './middleware/errorHandler.js';
import { authRouter } from './routes/auth.js';
import { auditRouter } from './routes/audit.js';
import { countryAssignmentsRouter } from './routes/countryAssignments.js';
import { customersRouter } from './routes/customers.js';
import { casesRouter } from './routes/cases.js';
import { caseDocumentsRouter, documentContentRouter } from './routes/documents.js';
import { catalogRouter } from './routes/catalog.js';
import { invitationsRouter } from './routes/invitations.js';
import { notificationsRouter } from './routes/notifications.js';
import { paymentAccountsRouter } from './routes/paymentAccounts.js';
import { pricingRulesRouter } from './routes/pricingRules.js';
import { paymentEvidenceRouter, quotationPaymentEvidenceRouter } from './routes/paymentEvidence.js';
import { quotationsRouter } from './routes/quotations.js';
import { usersRouter } from './routes/users.js';
import { workflowTemplatesRouter } from './routes/workflowTemplates.js';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: config.corsOrigin,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  const v1 = express.Router();

  v1.get('/health', (_req, res) => {
    const body: HealthResponse = {
      status: 'ok',
      service: config.serviceName,
      version: config.version,
      timestamp: new Date().toISOString(),
      database: isDatabaseConnected() ? 'connected' : 'disconnected',
    };
    res.json(body);
  });

  v1.use('/auth', authRouter);
  v1.use('/country-assignments', countryAssignmentsRouter);
  v1.use('/customers', customersRouter);
  v1.use('/users', usersRouter);
  v1.use('/invitations', invitationsRouter);
  v1.use('/cases', caseDocumentsRouter);
  v1.use('/cases', casesRouter);
  v1.use('/documents', documentContentRouter);
  v1.use('/catalog', catalogRouter);
  v1.use('/pricing-rules', pricingRulesRouter);
  v1.use('/payment-accounts', paymentAccountsRouter);
  v1.use('/quotations', quotationPaymentEvidenceRouter);
  v1.use('/quotations', quotationsRouter);
  v1.use('/payment-evidence', paymentEvidenceRouter);
  v1.use('/workflow-templates', workflowTemplatesRouter);
  v1.use('/audit', auditRouter);
  v1.use('/notifications', notificationsRouter);

  app.use('/api/v1', v1);

  app.use((_req, res) => {
    res.status(404).json({
      error: {
        code: 'NOT_FOUND',
        message: 'Resource not found',
      },
    });
  });

  app.use(errorHandler);

  return app;
}
