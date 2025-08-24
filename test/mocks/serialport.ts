export class SerialPort {
  constructor(..._args: any[]) {}
  on(_event: string, _cb: (...args: any[]) => void) {
    return this;
  }
  write(_data: any, _cb?: (...args: any[]) => void) {}
  close(_cb?: (...args: any[]) => void) {}
}

export default { SerialPort };
