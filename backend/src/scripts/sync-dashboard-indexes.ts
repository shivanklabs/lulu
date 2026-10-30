import 'dotenv/config';
import { connectDatabase, disconnectDatabase } from '../config/database';
import { AppointmentModel } from '../modules/appointments/appointment.model';
import { AvailabilityModel } from '../modules/appointments/availability.model';
import { HospitalModel } from '../modules/hospitals/hospital.model';

// One-time migration for databases created before the role dashboards:
// - appointments.slotId_1 was unique & NON-sparse; dashboard bookings have no slotId, so the old
//   index would reject the second such booking. syncIndexes() rebuilds it as unique+sparse.
// - creates the activeSlotKey unique index (double-booking guard) and the new hospital indexes.
// Only these three collections are synced; no other collection's indexes are touched.
if (require.main === module) {
  (async () => {
    try {
      await connectDatabase();
      for (const model of [AppointmentModel, AvailabilityModel, HospitalModel]) {
        const dropped = await model.syncIndexes();
        process.stdout.write(
          `${model.collection.collectionName}: indexes in sync${dropped.length ? ` (rebuilt: ${dropped.join(', ')})` : ''}\n`
        );
      }
      await disconnectDatabase();
      process.exit(0);
    } catch (err) {
      process.stderr.write(`Index sync failed: ${err instanceof Error ? err.message : 'unknown error'}\n`);
      await disconnectDatabase().catch(() => undefined);
      process.exit(1);
    }
  })();
}
