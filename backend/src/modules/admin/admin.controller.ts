import { Request, Response, NextFunction } from 'express';
import { getSystemOverview, getComplianceAuditLogs } from './admin.service';

export const getOverviewHandler = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const overview = await getSystemOverview();
    res.status(200).json({
      success: true,
      data: overview,
    });
  } catch (err) {
    next(err);
  }
};

export const getAuditLogsHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const limit = parseInt(req.query.limit as string, 10) || 50;
    const skip = parseInt(req.query.skip as string, 10) || 0;
    const logs = await getComplianceAuditLogs(limit, skip);

    res.status(200).json({
      success: true,
      data: logs,
    });
  } catch (err) {
    next(err);
  }
};
