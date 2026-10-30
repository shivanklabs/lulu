import { Request, Response, NextFunction } from 'express';
import { HospitalDashboardService } from './hospital-dashboard.service';
import { ShiftStatus } from './hospital-staff.model';

export const getHospitalOverviewHandler = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const overview = await HospitalDashboardService.getOverview();
    res.status(200).json({
      success: true,
      data: overview,
    });
  } catch (err) {
    next(err);
  }
};

export const getTopDoctorsHandler = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const doctors = await HospitalDashboardService.getTopDoctors();
    res.status(200).json({
      success: true,
      data: doctors,
    });
  } catch (err) {
    next(err);
  }
};

export const getStaffRosterHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { shiftStatus, department, search } = req.query;
    const roster = await HospitalDashboardService.getStaffRoster({
      shiftStatus: shiftStatus as ShiftStatus,
      department: department as string,
      search: search as string,
    });
    res.status(200).json({
      success: true,
      data: roster,
    });
  } catch (err) {
    next(err);
  }
};

export const addStaffMemberHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const facilityId = req.user?.userId;
    const staff = await HospitalDashboardService.addStaffMember({
      ...req.body,
      ...(facilityId ? { facilityId } : {}),
    });
    res.status(201).json({
      success: true,
      data: staff,
    });
  } catch (err) {
    next(err);
  }
};

export const updateStaffShiftStatusHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const { shiftStatus } = req.body;
    const updated = await HospitalDashboardService.updateStaffShiftStatus(id, shiftStatus);
    res.status(200).json({
      success: true,
      data: updated,
    });
  } catch (err) {
    next(err);
  }
};
