import { Request, Response, NextFunction } from 'express';
import {
  registerUser,
  loginUser,
  refreshAccessToken,
  getCurrentUserAndProfile,
  acceptDoctorInvite,
  toPublicUser,
} from './auth.service';
import { getPlatformComplianceInfo } from './privacy-consent-disclosure';
import { AppError } from '../../middleware/errorHandler';
import { IUser } from '../users/user.model';

// `user` is the canonical shape; flat fields are kept for existing clients.
const authResponse = (user: IUser, accessToken: string, refreshToken: string) => ({
  user: toPublicUser(user),
  userId: user._id,
  email: user.email,
  role: user.role,
  accessToken,
  refreshToken,
});

export const registerHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { user, accessToken, refreshToken } = await registerUser(req.body);
    res.status(201).json({
      success: true,
      data: authResponse(user, accessToken, refreshToken),
    });
  } catch (err) {
    next(err);
  }
};

export const loginHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email, password, role } = req.body;
    const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'] as string;

    const { user, accessToken, refreshToken } = await loginUser(email, password, ipAddress, userAgent, role);
    res.status(200).json({
      success: true,
      data: authResponse(user, accessToken, refreshToken),
    });
  } catch (err) {
    next(err);
  }
};

export const acceptInviteHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { user, accessToken, refreshToken } = await acceptDoctorInvite(req.body.token, req.body.password);
    res.status(200).json({
      success: true,
      data: authResponse(user, accessToken, refreshToken),
    });
  } catch (err) {
    next(err);
  }
};

export const refreshHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { refreshToken } = req.body;
    const { accessToken } = await refreshAccessToken(refreshToken);
    res.status(200).json({
      success: true,
      data: { accessToken },
    });
  } catch (err) {
    next(err);
  }
};

export const meHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
    }
    const data = await getCurrentUserAndProfile(req.user.userId);
    res.status(200).json({
      success: true,
      data,
    });
  } catch (err) {
    next(err);
  }
};

export const complianceInfoHandler = (_req: Request, res: Response): void => {
  const info = getPlatformComplianceInfo();
  res.status(200).json({
    success: true,
    data: info,
  });
};
