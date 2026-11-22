export type AttendanceFace = {
  getEnrollment(): Promise<string | null>;
  captureStraight(uri: string, enrollment: boolean): Promise<string>;
  captureTurn(uri: string): Promise<string>;
  confirm(): Promise<string>;
  cancel(): Promise<void>;
};
