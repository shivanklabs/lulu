import { Request, Response, NextFunction } from 'express';
import { SkinDiseasePhotoService } from './skin-disease-photo.service';
import { AppError } from '../../middleware/errorHandler';

export const screenSkinPhotoHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { fileBase64, mimeType, symptoms, patientId } = req.body;
    if (!fileBase64) {
      throw new AppError('Missing fileBase64 image data', 400, 'BAD_REQUEST');
    }

    const fileBuffer = Buffer.from(fileBase64, 'base64');
    const result = await SkinDiseasePhotoService.screenPhoto(
      {
        fileBuffer,
        mimeType: mimeType || 'image/jpeg',
        symptoms,
        patientId,
      },
      req.user
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
};
