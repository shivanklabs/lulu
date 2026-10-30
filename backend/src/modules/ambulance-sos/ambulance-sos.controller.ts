import { Request, Response, NextFunction } from 'express';
import { AmbulanceSosService } from './ambulance-sos.service';
import { AppError } from '../../middleware/errorHandler';

export const dispatchAmbulanceHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const { latitude, longitude, address, callerPhone, triageNotes, ambulanceType, vehicleTier } = req.body;
    if (latitude === undefined || longitude === undefined) {
      throw new AppError('GPS coordinates (latitude, longitude) are required for emergency dispatch', 400, 'BAD_REQUEST');
    }

    const dispatch = await AmbulanceSosService.dispatchAmbulance(
      req.user,
      {
        latitude: Number(latitude),
        longitude: Number(longitude),
        address,
        callerPhone,
        triageNotes,
        ambulanceType,
        vehicleTier,
      },
      req.ip,
      req.get('user-agent')
    );

    res.status(201).json({
      success: true,
      data: dispatch,
    });
  } catch (err) {
    next(err);
  }
};

export const getMyDispatchesHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const dispatches = await AmbulanceSosService.getPatientDispatches(req.user);
    res.status(200).json({
      success: true,
      data: dispatches,
    });
  } catch (err) {
    next(err);
  }
};

export const getActiveDispatchesHandler = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const dispatches = await AmbulanceSosService.getActiveDispatches();
    res.status(200).json({
      success: true,
      data: dispatches,
    });
  } catch (err) {
    next(err);
  }
};

export const updateDispatchStatusHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { status, etaMinutes } = req.body;
    if (!status) {
      throw new AppError('Status is required', 400, 'BAD_REQUEST');
    }

    const dispatch = await AmbulanceSosService.updateDispatchStatus(
      req.params.id,
      status,
      etaMinutes !== undefined ? Number(etaMinutes) : undefined
    );

    res.status(200).json({
      success: true,
      data: dispatch,
    });
  } catch (err) {
    next(err);
  }
};

export const getNearbyAmbulancesHandler = (req: Request, res: Response): void => {
  const { lat, lng } = req.query;
  const latitude = lat ? parseFloat(lat as string) : 28.6139;
  const longitude = lng ? parseFloat(lng as string) : 77.2090;
  const nearby = AmbulanceSosService.getNearbyAmbulances(latitude, longitude);
  res.status(200).json({
    success: true,
    data: nearby,
  });
};
