import { requireOptionalNativeModule } from 'expo';

import type { AttendanceFace } from './attendance-face-types';

export const attendanceFace =
  requireOptionalNativeModule<AttendanceFace>('AttendanceFace');
