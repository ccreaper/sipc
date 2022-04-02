import { ipcMain, IpcMainInvokeEvent, ipcRenderer, WebContents } from 'electron';

export type SipcCallback = Function;
export type SipcLibrary = { [functionName: string]: SipcCallback };
export type SipcDispatcher = (functionName: string) => SipcCallback;

export interface ISipcServer<T extends SipcLibrary> {
  readonly name: string;
  readonly library: T | SipcDispatcher;
  listen: (web: WebContents) => void;
  deafen: (web: WebContents) => boolean;
}

export class SipcServer<T extends SipcLibrary> implements ISipcServer<T> {
  public readonly name: string;
  public readonly library: T | SipcDispatcher;
  private _listento: WebContents[] = [];

  public listen(web: WebContents) {
    this._listento.push(web);
  }

  public deafen(web: WebContents) {
    const prevcount = this._listento.length;
    this._listento = this._listento.filter(wc => wc !== web);
    return prevcount !== this._listento.length;
  }

  public constructor(name: string, library: T | SipcDispatcher, defaultWeb?: WebContents) {
    this.name = name;
    this.library = library;

    if (defaultWeb) {
      this.listen(defaultWeb);
    }

    if (ipcMain !== undefined) {
      ipcMain.handle(
        this.name,
        async (event: IpcMainInvokeEvent, channel: string, ...args: any[]) => {
          const webc = this._listento.find(c => c === event.sender);
          if (webc) {
            const tryFunc =
              typeof this.library === 'function' ? this.library(channel) : this.library[channel];
            if (tryFunc !== undefined) {
              return await tryFunc(...args);
            }
          }
        }
      );
    }
  }
}

export class SipcClient<T extends SipcLibrary> {
  public readonly library: T = {} as T;
  public constructor(public readonly name: string, keys: { [k in keyof T]: 'allow' | 'deny' }) {
    Object.entries(keys).forEach(([fn, action]) => {
      if (typeof fn === 'string' && action === 'allow') {
        (this.library as Record<string, SipcCallback>)[fn] = async (...args: any[]): Promise<any> => {
            const result = await ipcRenderer.invoke(name, fn, ...args);
            return result instanceof Uint8Array ? Buffer.from(result) : result;
        };
      }
    });
  }
}