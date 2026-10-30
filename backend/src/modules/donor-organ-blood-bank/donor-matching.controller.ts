import { Request, Response, NextFunction } from 'express';
import { DonorMatchingService } from './donor-matching.service';
import { AnonymizedDonorModel } from './anonymized-donor.model';
import { BloodGroupType, OrganTissueType } from './blood-organ-bank.model';
import { AppError } from '../../middleware/errorHandler';

export const getDonorInventoryHandler = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const inventory = await DonorMatchingService.getInventory();
    const totalRegisteredDonors = await AnonymizedDonorModel.countDocuments();
    const inventoryObj = inventory.toObject();
    res.status(200).json({
      success: true,
      data: {
        ...inventoryObj,
        organInventory: inventoryObj.organRegistry,
        totalRegisteredDonors,
      },
    });
  } catch (err) {
    next(err);
  }
};

export const searchCompatibleDonorsHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { bloodGroup, organType, minHlaMatchPercent, minHlaMatch, maxDistanceKm } = req.query;
    const minHla = minHlaMatchPercent || minHlaMatch;
    const normalizedOrgan = organType ? (organType as string).toUpperCase() : undefined;

    const matches = await DonorMatchingService.searchCompatibleDonors({
      bloodGroup: bloodGroup as BloodGroupType,
      organType: normalizedOrgan as OrganTissueType,
      minHlaMatchPercent: minHla ? parseFloat(minHla as string) : undefined,
      maxDistanceKm: maxDistanceKm ? parseFloat(maxDistanceKm as string) : undefined,
    });

    res.status(200).json({
      success: true,
      data: matches,
    });
  } catch (err) {
    next(err);
  }
};

export const requestAllocationHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user || (req.user.role !== 'DOCTOR' && req.user.role !== 'ADMIN')) {
      throw new AppError('Only verified clinicians and administrators may request donor allocations', 403, 'FORBIDDEN');
    }

    const { donorAliasId, recipientSpecialId, urgency, justification } = req.body;

    if (!donorAliasId || !recipientSpecialId || !justification) {
      throw new AppError('donorAliasId, recipientSpecialId, and clinical justification are required', 400, 'INVALID_INPUT');
    }

    const result = await DonorMatchingService.requestAllocation(
      donorAliasId,
      recipientSpecialId,
      urgency || 'URGENT',
      justification,
      req.user
    );

    res.status(201).json({
      success: true,
      data: {
        ...result,
        allocationId: result.requestId,
        auditLogged: result.auditRecorded,
      },
    });
  } catch (err) {
    next(err);
  }
};
