import { UserModel } from '../users/user.model';
import { DoctorModel } from '../doctors/doctor.model';
import { PatientModel } from '../patients/patient.model';
import { AppointmentModel } from '../appointments/appointment.model';
import { AuditLogModel } from '../audit/audit.model';

export const getSystemOverview = async () => {
  const [totalUsers, totalPatients, totalDoctors, pendingDoctors, totalAppointments, totalAuditLogs] =
    await Promise.all([
      UserModel.countDocuments(),
      PatientModel.countDocuments(),
      DoctorModel.countDocuments(),
      DoctorModel.countDocuments({ verificationStatus: 'PENDING' }),
      AppointmentModel.countDocuments(),
      AuditLogModel.countDocuments(),
    ]);

  return {
    totalUsers,
    totalPatients,
    totalDoctors,
    pendingDoctors,
    totalAppointments,
    totalAuditLogs,
  };
};

export const getComplianceAuditLogs = async (limit = 100, skip = 0) => {
  return AuditLogModel.find()
    .sort({ timestamp: -1 })
    .skip(skip)
    .limit(limit)
    .lean();
};
