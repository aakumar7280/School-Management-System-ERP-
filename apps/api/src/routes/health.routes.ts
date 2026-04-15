import { Router } from 'express';

const healthRouter = Router();

healthRouter.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'school-erp-api' });
});

export { healthRouter };
