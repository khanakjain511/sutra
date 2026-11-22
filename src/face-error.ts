export class FaceRejected extends Error {
  readonly status: string;

  constructor(status: string) {
    super(status);
    this.name = 'FaceRejected';
    this.status = status;
  }
}
