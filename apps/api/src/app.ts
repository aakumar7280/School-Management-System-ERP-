import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';

import { env } from './env.js';
import { errorHandler } from './middleware/error-handler.js';
import { apiRouter } from './routes/index.js';

const app = express();
const normalizeOrigin = (value: string) => value.trim().replace(/\/$/, '');

const allowedOrigins = (env.CORS_ORIGIN ?? '')
	.split(',')
	.map((origin) => normalizeOrigin(origin))
	.filter(Boolean);

const isCorsRestricted = allowedOrigins.length > 0;

app.use(
	helmet({
		crossOriginResourcePolicy: false
	})
);
app.use(
	cors({
		credentials: true,
		origin: (origin, callback) => {
			if (!origin || !isCorsRestricted || allowedOrigins.includes(normalizeOrigin(origin))) {
				return callback(null, true);
			}

			return callback(new Error('Not allowed by CORS'));
		}
	})
);
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));
app.use('/uploads', express.static(path.resolve(process.cwd(), 'apps/api/uploads')));

app.use('/api', apiRouter);

app.use(errorHandler);

export { app };
