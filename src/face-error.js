export class FaceRejected extends Error {
  constructor(status) {
    super(status);
    this.name = 'FaceRejected';
    this.status = status;
  }
}
