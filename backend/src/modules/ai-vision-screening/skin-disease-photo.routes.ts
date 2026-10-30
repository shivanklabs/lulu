import { Router } from 'express';
import { screenSkinPhotoHandler } from './skin-disease-photo.controller';
import { aiRateLimiter } from '../../middleware/rateLimiter';
import { authenticate } from '../../middleware/auth.middleware';

export const aiVisionScreeningRouter = Router();

aiVisionScreeningRouter.use(aiRateLimiter);
aiVisionScreeningRouter.post('/screen-skin', authenticate, screenSkinPhotoHandler);
